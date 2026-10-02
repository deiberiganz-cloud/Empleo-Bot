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

    test('la fecha de postulación se anota la primera vez y no se pisa al ir y volver', () => {
        manager.guardar(ofertaDePrueba())
        const [{ id }] = manager.listar()
        assert.equal(manager.obtenerPorId(id).fecha_postulacion, null)
        const primera = manager.cambiarEstado(id, 'postulada').fecha_postulacion
        assert.ok(primera)
        manager.cambiarEstado(id, 'me_interesa')
        manager.cambiarEstado(id, 'postulada')
        assert.equal(manager.obtenerPorId(id).fecha_postulacion, primera)
    })

    test('cambiarEstado rechaza un estado inválido', () => {
        assert.throws(() => manager.cambiarEstado(1, 'cualquiera'), /Estado inválido/)
    })
})

describe('Archivo y limpieza', () => {
    let manager
    const ahora = new Date('2026-11-30T12:00:00Z')
    const haceDias = dias => new Date(ahora.getTime() - dias * 864e5).toISOString()
    beforeEach(() => {
        manager = new OfertasManager(conectarDB(':memory:'))
    })

    test('archiva las cerradas hace 7 días o más, y no las que siguen en proceso', () => {
        manager.guardar(ofertaDePrueba({ url: 'u/rechazada', encontrada: '2026-11-01' }))
        manager.guardar(ofertaDePrueba({ url: 'u/reciente', encontrada: '2026-11-01' }))
        manager.guardar(ofertaDePrueba({ url: 'u/postulada', encontrada: '2026-11-01' }))
        const [rechazada, reciente, postulada] = ['u/rechazada', 'u/reciente', 'u/postulada'].map(url => manager.obtenerPorUrl(url))
        manager.cambiarEstado(rechazada.id, 'rechazada', haceDias(8))
        manager.cambiarEstado(reciente.id, 'descartada', haceDias(3))
        manager.cambiarEstado(postulada.id, 'postulada', haceDias(20))

        assert.deepEqual(manager.limpiar(ahora), { archivadas: 1, borradas: 0 })
        assert.deepEqual(manager.listar({ archivadas: true }).map(o => o.url), ['u/rechazada'])
        assert.equal(manager.listar().length, 2)
    })

    test('borra las archivadas hace 30 días y las nuevas sin tocar, pero recuerda sus url', () => {
        manager.guardar(ofertaDePrueba({ url: 'u/vieja', encontrada: '2026-10-01' }))
        manager.guardar(ofertaDePrueba({ url: 'u/nueva-reciente', encontrada: '2026-11-25' }))
        manager.guardar(ofertaDePrueba({ url: 'u/archivada', encontrada: '2026-10-01' }))
        const archivada = manager.obtenerPorUrl('u/archivada')
        manager.cambiarEstado(archivada.id, 'postulada', haceDias(50))
        manager.cambiarEstado(archivada.id, 'rechazada', haceDias(45))
        manager.limpiar(new Date(ahora.getTime() - 31 * 864e5))

        assert.deepEqual(manager.limpiar(ahora), { archivadas: 0, borradas: 2 })
        assert.deepEqual(manager.listar().map(o => o.url), ['u/nueva-reciente'])
        assert.ok(manager.urlsGuardadas().has('u/vieja'))
        assert.ok(manager.urlsGuardadas().has('u/archivada'))
        // El historial no pierde la postulación aunque la oferta ya no exista.
        assert.deepEqual(manager.historial(), { postuladas: 1, porEstado: { rechazada: 1 } })
    })

    test('cambiarle el estado a una archivada la vuelve a activar', () => {
        manager.guardar(ofertaDePrueba({ encontrada: '2026-11-01' }))
        const [oferta] = manager.listar()
        manager.cambiarEstado(oferta.id, 'descartada', haceDias(10))
        manager.limpiar(ahora)
        manager.cambiarEstado(oferta.id, 'me_interesa')
        assert.equal(manager.listar().length, 1)
        assert.equal(manager.obtenerPorId(oferta.id).archivada, null)
    })

    test('agregarNota suma líneas sin borrar las notas propias', () => {
        manager.guardar(ofertaDePrueba())
        const [oferta] = manager.listar()
        manager.guardarNotas(oferta.id, 'Mi nota')
        assert.equal(manager.agregarNota(oferta.id, '🤖 Nota del bot').notas, 'Mi nota\n🤖 Nota del bot')
    })

    test('recuerda qué correos ya procesó', () => {
        assert.equal(manager.yaProcesado('<a@b>'), false)
        manager.marcarProcesado('<a@b>')
        assert.equal(manager.yaProcesado('<a@b>'), true)
    })
})

describe('API /api/ofertas', () => {
    let servidor
    let base
    let manager
    // Claude de mentira: devuelve una carta fija, o falla si el título dice "falla".
    const escribirCartaFalsa = async oferta => {
        if (oferta.titulo.includes('falla')) throw new Error('Claude tardó demasiado en responder')
        return `Carta para ${oferta.titulo}`
    }
    beforeEach(async () => {
        manager = new OfertasManager(conectarDB(':memory:'))
        manager.guardar(ofertaDePrueba())
        manager.guardar(ofertaDePrueba({ url: 'https://ejemplo.com/falla', titulo: 'Oferta que falla' }))
        servidor = crearApp(manager, {
            escribirCarta: escribirCartaFalsa,
            escribirSeguimiento: async oferta => `Seguimiento de ${oferta.titulo}`,
        }).listen(0)
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

    test('PATCH /:id/entrevista guarda la fecha, la borra con null y rechaza fechas inválidas', async () => {
        const ok = await enviar('PATCH', '/1/entrevista', { fecha: '2026-10-06T15:00' })
        assert.equal(ok.codigo, 200)
        assert.equal(ok.cuerpo.payload.fecha_entrevista, '2026-10-06T15:00')
        assert.equal((await enviar('PATCH', '/1/entrevista', { fecha: null })).cuerpo.payload.fecha_entrevista, null)
        assert.equal((await enviar('PATCH', '/1/entrevista', { fecha: 'mañana' })).codigo, 400)
    })

    test('POST /:id/seguimiento escribe el mensaje y lo guarda', async () => {
        const { codigo, cuerpo } = await enviar('POST', '/1/seguimiento')
        assert.equal(codigo, 200)
        assert.equal(cuerpo.payload.mensaje_seguimiento, 'Seguimiento de Desarrollador Junior')
    })

    test('GET ?archivadas=1 lista solo el Archivo, y GET /historial da los totales', async () => {
        await patchEstado(1, 'descartada')
        manager.limpiar(new Date(Date.now() + 8 * 864e5))
        assert.deepEqual((await pedir('')).cuerpo.payload.map(o => o.id), [2])
        assert.deepEqual((await pedir('?archivadas=1')).cuerpo.payload.map(o => o.id), [1])
        const { codigo, cuerpo } = await pedir('/historial')
        assert.equal(codigo, 200)
        assert.deepEqual(cuerpo.payload, { postuladas: 0, porEstado: { descartada: 1 } })
    })
})
