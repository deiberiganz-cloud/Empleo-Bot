import { test, describe, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { conectarDB } from '../config/db.js'
import { OfertasManager } from '../dao/OfertasManager.js'
import { crearApp } from '../crearApp.js'
import { crearBuscador, proximaBusqueda, tocaBuscar } from '../services/busqueda.js'

// Scripts de mentira en lugar de buscar.js: no bajan portales ni llaman a Claude.
const scriptFalso = codigo => {
    const archivo = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'empleo-bot-')), 'falso.js')
    fs.writeFileSync(archivo, codigo)
    return archivo
}

const RESUMEN = { recibidas: 40, evaluadas: 8, buenas: 3, errores: [] }

describe('crearBuscador', () => {
    test('devuelve el resumen, y dos pedidos a la vez comparten la misma búsqueda', async () => {
        const script = scriptFalso(`
            const fs = require('fs'); const marca = __filename + '.veces';
            fs.appendFileSync(marca, 'x');
            setTimeout(() => console.log(JSON.stringify({ veces: fs.readFileSync(marca, 'utf8').length })), 200);
        `)
        const buscador = crearBuscador({ script })
        const pedidos = [buscador.buscar(), buscador.buscar()]
        assert.equal(buscador.enCurso(), true)
        const [primera, segunda] = await Promise.all(pedidos)
        assert.deepEqual(primera, { veces: 1 })
        assert.equal(primera, segunda)
        assert.equal(buscador.enCurso(), false)
        // Terminada la anterior, el siguiente pedido arranca una búsqueda nueva.
        assert.deepEqual(await buscador.buscar(), { veces: 2 })
    })

    test('si el script falla, el error queda guardado hasta la próxima búsqueda que salga bien', async () => {
        const buscador = crearBuscador({ script: scriptFalso(`console.error('No respondió ninguna fuente'); process.exit(1)`) })
        await assert.rejects(buscador.buscar(), /No respondió ninguna fuente/)
        assert.equal(buscador.ultimoError(), 'No respondió ninguna fuente')
    })

    test('corta la búsqueda si tarda más del máximo', async () => {
        const buscador = crearBuscador({ script: scriptFalso('setTimeout(() => {}, 60000)'), minutosMaximos: 0.002 })
        await assert.rejects(buscador.buscar(), /tardó más de/)
        assert.equal(buscador.enCurso(), false)
    })
})

describe('cuándo toca buscar', () => {
    const AHORA = new Date('2026-10-02T20:00:00Z')

    test('toca si nunca se buscó o si pasaron 12 horas', () => {
        assert.equal(tocaBuscar(null, AHORA), true)
        assert.equal(tocaBuscar({ fecha: '2026-10-02T08:00:00Z' }, AHORA), true)
        assert.equal(tocaBuscar({ fecha: '2026-10-02T08:00:01Z' }, AHORA), false)
    })

    test('la próxima es 12 horas después de la última, o null si ya toca', () => {
        assert.equal(proximaBusqueda({ fecha: '2026-10-02T15:00:00Z' }, AHORA), '2026-10-03T03:00:00.000Z')
        assert.equal(proximaBusqueda(null, AHORA), null)
    })
})

describe('OfertasManager: búsquedas', () => {
    test('anota cada búsqueda y devuelve la última con sus errores', () => {
        const manager = new OfertasManager(conectarDB(':memory:'))
        assert.equal(manager.ultimaBusqueda(), null)
        manager.registrarBusqueda({ recibidas: 10, nuevas: 2, buenas: 1 }, '2026-10-01T09:00:00.000Z')
        manager.registrarBusqueda({ recibidas: 40, nuevas: 8, buenas: 3, errores: ['RemoteOK: respondió 503'] }, '2026-10-02T09:00:00.000Z')
        assert.deepEqual(manager.ultimaBusqueda(), {
            fecha: '2026-10-02T09:00:00.000Z', recibidas: 40, nuevas: 8, buenas: 3, errores: ['RemoteOK: respondió 503'],
        })
    })
})

describe('API /api/busqueda', () => {
    let servidor
    let base
    let manager
    let busquedas

    beforeEach(async () => {
        manager = new OfertasManager(conectarDB(':memory:'))
        busquedas = 0
        let enCurso = false
        // Buscador de mentira: anota la búsqueda como lo haría evaluar.js.
        const buscador = {
            buscar: async () => {
                busquedas++
                enCurso = true
                await new Promise(resolve => setTimeout(resolve, 50))
                manager.registrarBusqueda({ recibidas: 40, nuevas: 8, buenas: 3 })
                enCurso = false
                return RESUMEN
            },
            enCurso: () => enCurso,
            ultimoError: () => null,
        }
        servidor = crearApp(manager, {}, buscador).listen(0)
        await new Promise(resolve => servidor.once('listening', resolve))
        base = `http://localhost:${servidor.address().port}/api/busqueda`
    })
    afterEach(() => servidor.close())

    test('GET sin búsquedas: no hay última y toca buscar', async () => {
        const res = await fetch(base)
        const { payload } = await res.json()
        assert.equal(res.status, 200)
        assert.deepEqual(payload, { ultima: null, enCurso: false, error: null, proxima: null })
    })

    test('POST arranca la búsqueda y responde enseguida; al terminar, GET muestra la última', async () => {
        const res = await fetch(base, { method: 'POST' })
        assert.equal(res.status, 202)
        assert.equal((await res.json()).payload.enCurso, true)
        assert.equal(busquedas, 1)

        await new Promise(resolve => setTimeout(resolve, 100))
        const { payload } = await (await fetch(base)).json()
        assert.equal(payload.enCurso, false)
        assert.equal(payload.ultima.nuevas, 8)
        assert.ok(payload.proxima)
    })
})
