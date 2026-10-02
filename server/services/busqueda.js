import { spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// La misma búsqueda que se corre a mano (node busqueda/buscar.js): una sola forma de buscar.
const SCRIPT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'busqueda', 'buscar.js')
export const HORAS_ENTRE_BUSQUEDAS = 12
// Cada cuánto se fija si ya pasaron las 12 horas (no busca cada 30 minutos: solo mira el reloj).
export const MINUTOS_ENTRE_CONTROLES = 30
// Una búsqueda con muchas ofertas nuevas tarda unos minutos; si pasa de esto, se corta.
const MINUTOS_MAXIMOS_POR_BUSQUEDA = 30

const HORA = 60 * 60 * 1000

/**
 * Arma el "buscador": corre buscar.js en otro proceso (la API sigue atendiendo mientras tanto).
 * Si ya hay una búsqueda en curso, devuelve esa misma en vez de arrancar otra: el botón y el
 * temporizador nunca buscan dos veces a la vez.
 *
 * @param {{ script?: string, minutosMaximos?: number }} opciones el script a correr (los tests pasan
 *   uno de mentira para no bajar portales ni llamar a Claude) y el tiempo máximo
 * @returns {{ buscar: () => Promise<object>, enCurso: () => boolean, ultimoError: () => string | null }}
 */
export const crearBuscador = ({ script = SCRIPT, minutosMaximos = MINUTOS_MAXIMOS_POR_BUSQUEDA } = {}) => {
    let enCurso = null
    let ultimoError = null

    const correr = () => new Promise((resolve, reject) => {
        const proceso = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', script], { windowsHide: true })
        let salida = ''
        let errores = ''
        const temporizador = setTimeout(() => {
            proceso.kill()
            reject(new Error(`La búsqueda tardó más de ${minutosMaximos} minutos y se cortó`))
        }, minutosMaximos * 60 * 1000)
        proceso.stdout.on('data', parte => { salida += parte })
        proceso.stderr.on('data', parte => { errores += parte })
        proceso.on('error', error => {
            clearTimeout(temporizador)
            reject(new Error(`No se pudo buscar: ${error.message}`))
        })
        proceso.on('close', codigo => {
            clearTimeout(temporizador)
            if (codigo !== 0) return reject(new Error(errores.trim() || `buscar.js terminó con código ${codigo}`))
            try {
                resolve(JSON.parse(salida))
            } catch {
                reject(new Error('buscar.js no devolvió un JSON válido'))
            }
        })
    })

    const buscar = () => {
        enCurso ??= correr()
            .then(resumen => { ultimoError = null; return resumen })
            .catch(error => { ultimoError = error.message; throw error })
            .finally(() => { enCurso = null })
        return enCurso
    }

    return { buscar, enCurso: () => enCurso !== null, ultimoError: () => ultimoError }
}

/**
 * ¿Toca buscar? Sí si nunca se buscó o si la última búsqueda fue hace HORAS_ENTRE_BUSQUEDAS o más.
 * @param {{ fecha: string } | null} ultima la última búsqueda anotada en la base
 */
export const tocaBuscar = (ultima, ahora = new Date()) =>
    !ultima || ahora.getTime() - new Date(ultima.fecha).getTime() >= HORAS_ENTRE_BUSQUEDAS * HORA

/**
 * Cuándo toca la próxima búsqueda automática (texto ISO), o null si toca ya.
 */
export const proximaBusqueda = (ultima, ahora = new Date()) => {
    if (tocaBuscar(ultima, ahora)) return null
    return new Date(new Date(ultima.fecha).getTime() + HORAS_ENTRE_BUSQUEDAS * HORA).toISOString()
}

/**
 * Mientras la API esté abierta, se fija al arrancar y cada MINUTOS_ENTRE_CONTROLES si ya toca buscar.
 * La fecha de la última búsqueda sale de la base, así que la cuenta sigue aunque se cierre la app
 * (y también cuenta una búsqueda hecha a mano con node busqueda/buscar.js).
 * Los errores solo se anotan en la consola: el próximo control lo vuelve a intentar.
 *
 * @param {{ buscar: () => Promise<object>, ultimaBusqueda: () => ({ fecha: string } | null) }} dependencias
 */
export const buscarCuandoToque = ({ buscar, ultimaBusqueda }) => {
    const control = async () => {
        try {
            if (!tocaBuscar(ultimaBusqueda())) return
            console.log('Búsqueda automática: buscando ofertas nuevas...')
            const { evaluadas, buenas, errores } = await buscar()
            console.log(`Búsqueda automática: ${evaluadas} nuevas, ${buenas} recomendadas${errores.length ? ` (${errores.length} aviso/s)` : ''}`)
        } catch (error) {
            console.error(`Búsqueda automática: ${error.message}`)
        }
    }
    control()
    return setInterval(control, MINUTOS_ENTRE_CONTROLES * 60 * 1000)
}
