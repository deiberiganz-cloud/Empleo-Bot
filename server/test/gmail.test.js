import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { crearRevisorDeGmail } from '../services/gmail.js'

// Scripts de mentira en lugar de leer-respuestas.js: no leen Gmail ni tocan la base real.
const scriptFalso = codigo => {
    const archivo = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'empleo-bot-')), 'falso.js')
    fs.writeFileSync(archivo, codigo)
    return archivo
}

test('devuelve lo que imprime el script, y dos pedidos a la vez comparten la misma revisión', async () => {
    const script = scriptFalso(`
        const fs = require('fs'); const marca = __filename + '.veces';
        fs.appendFileSync(marca, 'x');
        setTimeout(() => console.log(JSON.stringify({ acciones: [{ veces: fs.readFileSync(marca, 'utf8').length }], errores: [] })), 200);
    `)
    const revisar = crearRevisorDeGmail({ script })
    const [primera, segunda] = await Promise.all([revisar(), revisar()])
    assert.deepEqual(primera, { acciones: [{ veces: 1 }], errores: [] })
    assert.equal(primera, segunda)
    // Terminada la anterior, el siguiente pedido arranca una revisión nueva.
    assert.deepEqual((await revisar()).acciones, [{ veces: 2 }])
})

test('si el script falla, devuelve el error que escribió', async () => {
    const revisar = crearRevisorDeGmail({ script: scriptFalso(`console.error('Falta la clave'); process.exit(1)`) })
    await assert.rejects(revisar(), /Falta la clave/)
})
