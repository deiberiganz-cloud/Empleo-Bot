import { spawn } from 'node:child_process'
import path from 'node:path'

// Claude Code instalado en la PC: usa la suscripción, sin API paga.
const CLAUDE = path.join(process.env.USERPROFILE ?? '', '.local', 'bin', 'claude.exe')

/**
 * Le hace una pregunta a Claude con `claude -p` y devuelve el texto de la respuesta.
 * Sin herramientas, sin guardar la sesión y sin cargar el CLAUDE.md del usuario
 * (`--setting-sources ""`), para que responda solo lo que se le pide.
 *
 * Es asíncrona (spawn, no spawnSync) para que la API siga atendiendo mientras Claude piensa.
 *
 * @param {string} prompt Lo que se le pregunta.
 * @param {{ sistema: string, modelo?: string, timeoutMs?: number }} opciones
 * @returns {Promise<string>}
 */
export const preguntarAClaude = (prompt, { sistema, modelo = 'sonnet', timeoutMs = 180000 }) =>
    new Promise((resolve, reject) => {
        const proceso = spawn(
            CLAUDE,
            ['-p', '--system-prompt', sistema, '--tools', '', '--model', modelo,
                '--no-session-persistence', '--setting-sources', ''],
            { windowsHide: true },
        )
        let salida = ''
        let errores = ''
        const temporizador = setTimeout(() => {
            proceso.kill()
            reject(new Error('Claude tardó demasiado en responder'))
        }, timeoutMs)

        proceso.stdout.on('data', parte => { salida += parte })
        proceso.stderr.on('data', parte => { errores += parte })
        proceso.on('error', error => {
            clearTimeout(temporizador)
            reject(new Error(`No se pudo ejecutar Claude: ${error.message}`))
        })
        proceso.on('close', codigo => {
            clearTimeout(temporizador)
            if (codigo !== 0) return reject(new Error(`Claude terminó con error: ${errores.trim() || codigo}`))
            resolve(salida.trim())
        })

        proceso.stdin.end(prompt, 'utf8')
    })
