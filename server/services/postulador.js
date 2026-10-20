import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { CLAUDE } from './claude.js'
import { armarPrompt, buscarCv, CARPETA_CV, leerPerfil } from './postulador-prompt.js'

export const LIMITE_DIARIO = 10
// Una postulación con formulario largo puede tardar; pasado esto se mata el proceso y la oferta queda bloqueada.
export const MINUTOS_MAXIMOS_POR_OFERTA = 15
// Cada cuánto se fija si hay ofertas esperando (por ejemplo, al empezar un día nuevo con el límite agotado).
export const MINUTOS_ENTRE_CONTROLES = 30
const LARGO_MAXIMO_NOTA = 600

// La salida cruda de cada intento queda acá (data/ está fuera de git), por si hay que ver qué pasó.
const CARPETA_SALIDAS = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'data', 'postulador')

const RESULTADOS = ['postulada', 'descartada', 'bloqueada']
const ETIQUETAS = { postulada: 'Postulada', descartada: 'Descartada', bloqueada: 'Bloqueada' }

const bloqueada = nota => ({ resultado: 'bloqueada', nota })
const recortar = texto => (texto.length > LARGO_MAXIMO_NOTA ? `${texto.slice(0, LARGO_MAXIMO_NOTA)}…` : texto)

/**
 * Saca el { resultado, nota } del texto que respondió Claude. Tolera texto alrededor del JSON.
 * Si no hay un JSON válido, la oferta queda bloqueada (nunca se asume que se postuló).
 *
 * @param {string} texto lo que respondió Claude (el campo `result` de la salida)
 * @returns {{ resultado: 'postulada' | 'descartada' | 'bloqueada', nota: string }}
 */
export const interpretarResultado = texto => {
    const completo = String(texto ?? '')
    const ultima = completo.lastIndexOf('}')
    // Prueba desde cada "{" hasta la última "}": el primero que sea un JSON con resultado válido gana.
    for (let inicio = completo.indexOf('{'); inicio !== -1 && ultima > inicio; inicio = completo.indexOf('{', inicio + 1)) {
        try {
            const dato = JSON.parse(completo.slice(inicio, ultima + 1))
            if (RESULTADOS.includes(dato?.resultado)) {
                const nota = typeof dato.nota === 'string' ? dato.nota.trim() : ''
                return { resultado: dato.resultado, nota: recortar(nota || 'Sin detalle.') }
            }
        } catch { /* no era el JSON: sigue con la próxima llave */ }
    }
    return bloqueada(recortar(`Claude no devolvió un resultado válido: ${completo.trim().slice(0, 200) || '(respuesta vacía)'}`))
}

/**
 * Lee la salida cruda de `claude -p --output-format json` y devuelve el resultado de la postulación.
 * @param {string} crudo stdout completo del proceso
 */
export const interpretarSalida = crudo => {
    let datos
    try {
        datos = JSON.parse(crudo)
    } catch {
        return bloqueada('Claude no devolvió una salida JSON válida')
    }
    // Algunas versiones devuelven una lista de eventos: el resultado es el elemento de tipo "result".
    const final = Array.isArray(datos) ? datos.findLast(evento => evento?.type === 'result') : datos
    if (!final) return bloqueada('Claude no devolvió una salida JSON válida')
    if (final.is_error) return bloqueada(recortar(`Claude terminó con error: ${final.result ?? final.subtype ?? 'sin detalle'}`))
    return interpretarResultado(final.result)
}

/**
 * Lanza Claude Code sin ventana con la extensión de Chrome y devuelve su salida cruda (texto JSON).
 * Es asíncrona (spawn) para que la API siga atendiendo. El prompt entra por stdin (es largo).
 * Si pasa del tiempo máximo, mata el proceso con todo su árbol y rechaza con `error.timeout = true`.
 *
 * @param {string} prompt
 * @param {{ timeoutMs?: number }} opciones
 * @returns {Promise<string>}
 */
export const ejecutarClaudeConChrome = (prompt, { timeoutMs = MINUTOS_MAXIMOS_POR_OFERTA * 60 * 1000 } = {}) =>
    new Promise((resolve, reject) => {
        const proceso = spawn(
            CLAUDE,
            ['-p', '--chrome', '--model', 'sonnet', '--no-session-persistence', '--setting-sources', '',
                '--allowedTools', 'mcp__claude-in-chrome__*', '--output-format', 'json',
                // Sin esto, file_upload no puede leer el CV (está fuera de la carpeta de trabajo).
                '--add-dir', CARPETA_CV],
            { windowsHide: true },
        )
        let salida = ''
        let errores = ''
        const temporizador = setTimeout(() => {
            // En Windows, kill() solo mata claude.exe; taskkill /T se lleva también a sus procesos hijos.
            if (process.platform === 'win32' && proceso.pid) spawn('taskkill', ['/pid', String(proceso.pid), '/T', '/F'], { windowsHide: true })
            else proceso.kill()
            reject(Object.assign(new Error(`Claude tardó más de ${Math.round(timeoutMs / 60000)} minutos y se cortó`), { timeout: true, salida }))
        }, timeoutMs)

        proceso.stdout.on('data', parte => { salida += parte })
        proceso.stderr.on('data', parte => { errores += parte })
        proceso.on('error', error => {
            clearTimeout(temporizador)
            reject(new Error(`No se pudo ejecutar Claude: ${error.message}`))
        })
        proceso.on('close', codigo => {
            clearTimeout(temporizador)
            // Con un error de Claude, la salida JSON igual trae el detalle: se la dejamos a interpretarSalida.
            if (codigo !== 0 && !salida.trim()) return reject(new Error(`Claude terminó con error: ${errores.trim() || codigo}`))
            resolve(salida)
        })
        proceso.stdin.end(prompt, 'utf8')
    })

/**
 * Arma el "postulador": toma las ofertas en "por_postular" de a UNA por vez y le pide a Claude
 * (con tu Chrome) que las postule o las descarte. La fila sale de la base (estado por_postular y
 * sin bloquear), así que no se pierde nada si la app se cierra. Si ya está trabajando, `despertar()`
 * no arranca otro: el botón Aceptar, el arranque y el temporizador nunca postulan dos a la vez.
 *
 * @param {object} dependencias
 * @param manager el OfertasManager
 * @param ejecutar (prompt, { timeoutMs }) => Promise<string> (los tests pasan uno de mentira, sin Claude ni Chrome)
 * @param leerContexto () => { perfil, rutaCv } (los tests no leen perfil.md ni buscan el CV)
 * @param ahora () => Date, para los tests
 * @returns {{ despertar: () => Promise<void>, estado: () => object, reintentar: (id: number) => object | null, arrancar: () => NodeJS.Timeout }}
 */
export const crearPostulador = ({
    manager,
    ejecutar = ejecutarClaudeConChrome,
    leerContexto = () => ({ perfil: leerPerfil(), rutaCv: buscarCv() }),
    limiteDiario = LIMITE_DIARIO,
    minutosMaximos = MINUTOS_MAXIMOS_POR_OFERTA,
    carpetaSalidas = CARPETA_SALIDAS,
    ahora = () => new Date(),
}) => {
    let enCurso = null
    let trabajando = null

    const ddmm = fecha => `${String(fecha.getDate()).padStart(2, '0')}/${String(fecha.getMonth() + 1).padStart(2, '0')}`

    const guardarSalida = (oferta, fecha, contenido) => {
        try {
            fs.mkdirSync(carpetaSalidas, { recursive: true })
            const nombre = `${oferta.id}-${fecha.toISOString().replace(/[:.]/g, '-')}.json`
            fs.writeFileSync(path.join(carpetaSalidas, nombre), contenido)
        } catch (error) {
            console.error(`Postulador: no se pudo guardar la salida cruda: ${error.message}`)
        }
    }

    // Aplica el resultado a la base. Si mientras tanto la moviste a mano, no le pisa el estado.
    const aplicar = (oferta, { resultado, nota }, duracionMs, fecha) => {
        const sigue = manager.obtenerPorId(oferta.id)?.estado === 'por_postular'
        if (resultado === 'postulada' && !['postulada', 'entrevista', 'oferta', 'rechazada'].includes(manager.obtenerPorId(oferta.id)?.estado)) {
            manager.cambiarEstado(oferta.id, 'postulada', fecha.toISOString())
        } else if (sigue && resultado === 'descartada') {
            manager.cambiarEstado(oferta.id, 'descartada', fecha.toISOString())
        } else if (sigue && resultado === 'bloqueada') {
            manager.bloquear(oferta.id, nota)
        }
        manager.agregarNota(oferta.id, `🤖 ${ddmm(fecha)}: ${ETIQUETAS[resultado]}. ${nota}`)
        manager.registrarIntento({ ofertaId: oferta.id, resultado, nota, duracionMs }, fecha)
    }

    const postular = async oferta => {
        enCurso = { id: oferta.id, titulo: oferta.titulo, empresa: oferta.empresa, desde: ahora().toISOString() }
        const inicio = Date.now()
        let datos
        try {
            const { perfil, rutaCv } = leerContexto()
            if (!rutaCv) {
                // Sin CV no se lanza Claude (no hay intento): queda bloqueada hasta que aparezca el archivo.
                manager.bloquear(oferta.id, 'No se encontró el CV (CV_*.pdf)')
                manager.agregarNota(oferta.id, `🤖 ${ddmm(ahora())}: Bloqueada. No se encontró el CV (CV_*.pdf).`)
                return
            }
            const prompt = armarPrompt({ oferta, perfil, rutaCv })
            const crudo = await ejecutar(prompt, { timeoutMs: minutosMaximos * 60 * 1000 })
            guardarSalida(oferta, ahora(), crudo)
            datos = interpretarSalida(crudo)
        } catch (error) {
            guardarSalida(oferta, ahora(), JSON.stringify({ error: error.message, salida: error.salida ?? null }, null, 2))
            datos = bloqueada(recortar(error.timeout
                ? `Timeout: pasaron más de ${minutosMaximos} minutos y se cortó.`
                : `Error: ${error.message}`))
        } finally {
            enCurso = null
        }
        aplicar(oferta, datos, Date.now() - inicio, ahora())
    }

    // Una por vez hasta vaciar la fila o llegar al límite del día. Las ya vistas en esta vuelta no se repiten.
    const vaciarFila = async () => {
        const vistas = new Set()
        while (manager.intentosDelDia(ahora()) < limiteDiario) {
            const oferta = manager.siguienteParaPostular()
            if (!oferta || vistas.has(oferta.id)) break
            vistas.add(oferta.id)
            try {
                await postular(oferta)
            } catch (error) {
                console.error(`Postulador: ${error.message}`)
            }
        }
    }

    // Si ya está trabajando, avisa que entró algo nuevo para que haga otra vuelta al terminar
    // (así una oferta aceptada justo cuando la fila se vaciaba no queda esperando al próximo control).
    let otraVuelta = false
    const despertar = () => {
        if (trabajando) {
            otraVuelta = true
            return trabajando
        }
        trabajando = (async () => {
            do {
                otraVuelta = false
                await vaciarFila()
            } while (otraVuelta)
        })().finally(() => { trabajando = null })
        return trabajando
    }

    const estado = () => ({
        enCurso,
        // La que está en curso sigue en "por_postular" pero no cuenta como "en fila".
        enFila: Math.max(0, manager.contarEnFila() - (enCurso ? 1 : 0)),
        intentosHoy: manager.intentosDelDia(ahora()),
        limite: limiteDiario,
    })

    // "Reintentar" una bloqueada: se levanta el bloqueo y vuelve a la fila.
    const reintentar = id => {
        const oferta = manager.obtenerPorId(id)
        if (!oferta || oferta.estado !== 'por_postular') return null
        const desbloqueada = manager.desbloquear(id)
        despertar().catch(error => console.error(`Postulador: ${error.message}`))
        return desbloqueada
    }

    // Al abrir la app y cada MINUTOS_ENTRE_CONTROLES: retoma lo que quedó en la fila (por ejemplo, al cambiar de día).
    const arrancar = () => {
        const control = () => despertar().catch(error => console.error(`Postulador: ${error.message}`))
        control()
        return setInterval(control, MINUTOS_ENTRE_CONTROLES * 60 * 1000)
    }

    return { despertar, estado, reintentar, arrancar }
}
