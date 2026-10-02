import { spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// El mismo script que se puede correr a mano: así hay una sola forma de hacer el seguimiento por Gmail.
const SCRIPT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'busqueda', 'leer-respuestas.js')
// Sin correos nuevos, una revisión gasta 0 tokens (solo lee encabezados): se puede revisar seguido.
export const MINUTOS_ENTRE_REVISIONES = 10

/**
 * Arma el "revisor" de Gmail: corre leer-respuestas.js en otro proceso (la API sigue atendiendo
 * mientras tanto) y devuelve { acciones, errores }.
 * Si ya hay una revisión en curso, devuelve esa misma en vez de arrancar otra: el botón y el
 * temporizador nunca leen el correo dos veces a la vez.
 *
 * @param {{ dias?: number, script?: string }} opciones días de correo a mirar (por defecto, 7) y el
 *   script a correr (los tests pasan uno de mentira para no leer Gmail ni tocar la base real)
 * @returns {() => Promise<{ acciones: object[], errores: string[] }>}
 */
export const crearRevisorDeGmail = ({ dias = 7, script = SCRIPT } = {}) => {
    let enCurso = null

    const revisar = () => new Promise((resolve, reject) => {
        const proceso = spawn(process.execPath, [script, String(dias)], { windowsHide: true })
        let salida = ''
        let errores = ''
        proceso.stdout.on('data', parte => { salida += parte })
        proceso.stderr.on('data', parte => { errores += parte })
        proceso.on('error', error => reject(new Error(`No se pudo revisar Gmail: ${error.message}`)))
        proceso.on('close', codigo => {
            if (codigo !== 0) return reject(new Error(errores.trim() || `leer-respuestas.js terminó con código ${codigo}`))
            try {
                resolve(JSON.parse(salida))
            } catch {
                reject(new Error('leer-respuestas.js no devolvió un JSON válido'))
            }
        })
    })

    return () => {
        enCurso ??= revisar().finally(() => { enCurso = null })
        return enCurso
    }
}

/**
 * Revisa Gmail al arrancar y después cada MINUTOS_ENTRE_REVISIONES, mientras la API esté abierta.
 * Los errores solo se anotan en la consola: la próxima vuelta lo vuelve a intentar.
 */
export const revisarCadaRato = revisarGmail => {
    const vuelta = async () => {
        try {
            const { acciones } = await revisarGmail()
            if (acciones.length) console.log(`Gmail: ${acciones.length} novedad(es) en las postulaciones`)
        } catch (error) {
            console.error(`Gmail: ${error.message}`)
        }
    }
    vuelta()
    return setInterval(vuelta, MINUTOS_ENTRE_REVISIONES * 60 * 1000)
}
