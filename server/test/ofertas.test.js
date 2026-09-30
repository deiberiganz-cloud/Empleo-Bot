import { test, describe, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { conectarDB } from '../config/db.js'
import { OfertasManager } from '../dao/OfertasManager.js'
import { crearApp } from '../crearApp.js'

const ofertaDePrueba = (cambios = {}) => ({
    url: 'https://ejemplo.com/1', titulo: 'Desarrollador Junior', empresa: 'ACME', fuente: 'Get on Board',
    encontrada: '2026-09-30', puntaje: 70, tipo: 'dev', motivo: 'Calza', postular: true, estafa: false,
    ...cambios,
})

describe('OfertasManager', () => {
    let manager
    beforeEach(() => {
        manager = new OfertasManager(conectarDB(':memory:'))
    })

    test('guarda una oferta nueva con estado "nueva" y booleanos reales', () => {
        assert.equal(manager.guardar(ofertaDePrueba()), true)
        const [oferta] = manager.listar()
        assert.equal(oferta.estado, 'nueva')
        assert.equal(oferta.postular, true)
        assert.equal(oferta.estafa, false)
    })

    test('no duplica ni pisa una oferta que ya existe', () => {
        manager.guardar(ofertaDePrueba())
        const [oferta] = manager.listar()
        manager.cambiarEstado(oferta.id, 'me_interesa')
        assert.equal(manager.guardar(ofertaDePrueba({ titulo: 'Otro título' })), false)
        const todas = manager.listar()
        assert.equal(todas.length, 1)
        assert.equal(todas[0].estado, 'me_interesa')
        assert.equal(todas[0].titulo, 'Desarrollador Junior')
    })

    test('urlsGuardadas devuelve las url que ya están en la base', () => {
        manager.guardar(ofertaDePrueba())
        const urls = manager.urlsGuardadas()
        assert.equal(urls.has('https://ejemplo.com/1'), true)
        assert.equal(urls.has('https://ejemplo.com/otra'), false)
    })

    test('filtra por estado y por tipo', () => {
        manager.guardar(ofertaDePrueba())
        manager.guardar(ofertaDePrueba({ url: 'https://ejemplo.com/2', tipo: 'soporte' }))
        assert.equal(manager.listar({ tipo: 'soporte' }).length, 1)
        assert.equal(manager.listar({ estado: 'descartada' }).length, 0)
    })

    test('cambiarEstado guarda la fecha y devuelve null si la oferta no existe', () => {
        manager.guardar(ofertaDePrueba())
        const [oferta] = manager.listar()
        const actualizada = manager.cambiarEstado(oferta.id, 'postulada')
        assert.equal(actualizada.estado, 'postulada')
        assert.ok(actualizada.estado_actualizado)
        assert.equal(manager.cambiarEstado(999, 'postulada'), null)
    })

    test('cambiarEstado rechaza un estado inválido', () => {
        assert.throws(() => manager.cambiarEstado(1, 'cualquiera'), /Estado inválido/)
    })
})

describe('API /api/ofertas', () => {
    let servidor
    let base
    // Claude de mentira: devuelve una carta fija, o falla si el título dice "falla".
    const escribirCartaFalsa = async oferta => {
        if (oferta.titulo.includes('falla')) throw new Error('Claude tardó demasiado en responder')
        return `Carta para ${oferta.titulo}`
    }
    beforeEach(async () => {
        const manager = new OfertasManager(conectarDB(':memory:'))
        manager.guardar(ofertaDePrueba())
        manager.guardar(ofertaDePrueba({ url: 'https://ejemplo.com/falla', titulo: 'Oferta que falla' }))
        servidor = crearApp(manager, escribirCartaFalsa).listen(0)
        await new Promise(resolve => servidor.once('listening', resolve))
        base = `http://localhost:${servidor.address().port}/api/ofertas`
    })
    afterEach(() => servidor.close())

    const pedir = async (ruta, opciones) => {
        const res = await fetch(base + ruta, opciones)
        return { codigo: res.status, cuerpo: await res.json() }
    }
    const patchEstado = (id, estado) => pedir(`/${id}/estado`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ estado }),
    })

    test('GET lista las ofertas', async () => {
        const { codigo, cuerpo } = await pedir('')
        assert.equal(codigo, 200)
        assert.equal(cuerpo.status, 'success')
        assert.equal(cuerpo.payload.length, 2)
    })

    test('GET con un estado inválido da 400', async () => {
        assert.equal((await pedir('?estado=xx')).codigo, 400)
    })

    test('GET /:id da 404 si no existe y 400 si no es número', async () => {
        assert.equal((await pedir('/999')).codigo, 404)
        assert.equal((await pedir('/abc')).codigo, 400)
    })

    test('PATCH cambia el estado, y valida el estado y el id', async () => {
        const ok = await patchEstado(1, 'me_interesa')
        assert.equal(ok.codigo, 200)
        assert.equal(ok.cuerpo.payload.estado, 'me_interesa')
        assert.equal((await patchEstado(1, 'xx')).codigo, 400)
        assert.equal((await patchEstado(999, 'descartada')).codigo, 404)
    })

    const enviar = (metodo, ruta, cuerpo) => pedir(ruta, {
        method: metodo, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cuerpo ?? {}),
    })

    test('POST /:id/carta escribe la carta con Claude y la guarda', async () => {
        const { codigo, cuerpo } = await enviar('POST', '/1/carta')
        assert.equal(codigo, 200)
        assert.equal(cuerpo.payload.carta, 'Carta para Desarrollador Junior')
        assert.equal((await pedir('/1')).cuerpo.payload.carta, 'Carta para Desarrollador Junior')
    })

    test('POST /:id/carta da 500 con el motivo si Claude falla, y 404 si no existe', async () => {
        const { codigo, cuerpo } = await enviar('POST', '/2/carta')
        assert.equal(codigo, 500)
        assert.match(cuerpo.error, /tardó demasiado/)
        assert.equal((await enviar('POST', '/999/carta')).codigo, 404)
    })

    test('PATCH /:id/carta guarda la carta editada y valida que sea texto', async () => {
        const ok = await enviar('PATCH', '/1/carta', { carta: 'Mi versión' })
        assert.equal(ok.codigo, 200)
        assert.equal(ok.cuerpo.payload.carta, 'Mi versión')
        assert.equal((await enviar('PATCH', '/1/carta', { carta: 123 })).codigo, 400)
        assert.equal((await enviar('PATCH', '/1/carta', { carta: 'x'.repeat(10001) })).codigo, 400)
    })

    test('PATCH /:id/notas guarda las notas', async () => {
        const ok = await enviar('PATCH', '/1/notas', { notas: 'Piden portfolio' })
        assert.equal(ok.cuerpo.payload.notas, 'Piden portfolio')
        assert.equal((await enviar('PATCH', '/999/notas', { notas: 'x' })).codigo, 404)
    })
})
