import { test, describe, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { conectarDB } from '../config/db.js'
import { OfertasManager } from '../dao/OfertasManager.js'
import { crearApp } from '../crearApp.js'
import { crearPostulador, interpretarResultado, interpretarSalida } from '../services/postulador.js'
import { armarPrompt } from '../services/postulador-prompt.js'

const AHORA = new Date(2026, 9, 18, 15, 30)

const ofertaDePrueba = (cambios = {}) => ({
    url: 'https://ejemplo.com/1', titulo: 'Soporte Junior', empresa: 'ACME', fuente: 'LinkedIn',
    descripcion: 'Atención al cliente', encontrada: '2026-10-17', postular: true, estafa: false,
    ...cambios,
})

// Guarda una oferta y la deja en "por_postular" (como el botón Aceptar).
const aceptar = (manager, cambios) => {
    manager.guardar(ofertaDePrueba(cambios))
    const { id } = manager.obtenerPorUrl(cambios?.url ?? 'https://ejemplo.com/1')
    manager.cambiarEstado(id, 'por_postular', '2026-10-18T10:00:00.000Z')
    return id
}

const salidaDeClaude = resultado => JSON.stringify({ type: 'result', is_error: false, result: resultado })
const respuesta = (resultado, nota = 'Listo') => salidaDeClaude(JSON.stringify({ resultado, nota }))

describe('interpretarResultado', () => {
    test('lee el JSON limpio', () => {
        assert.deepEqual(interpretarResultado('{"resultado":"postulada","nota":"Envié el formulario"}'),
            { resultado: 'postulada', nota: 'Envié el formulario' })
    })

    test('tolera texto (y llaves sueltas) antes y después del JSON', () => {
        const texto = 'Listo {terminé}. ```json\n{"resultado":"descartada","nota":"Pide inglés fluido"}\n``` Saludos'
        assert.deepEqual(interpretarResultado(texto), { resultado: 'descartada', nota: 'Pide inglés fluido' })
    })

    test('un JSON inválido o sin resultado conocido queda bloqueada, nunca postulada', () => {
        for (const texto of ['{"resultado":"postulada", roto', 'nada de JSON', '', '{"resultado":"quizás","nota":"x"}', '{"nota":"sin resultado"}']) {
            const { resultado, nota } = interpretarResultado(texto)
            assert.equal(resultado, 'bloqueada', texto)
            assert.match(nota, /no devolvió un resultado válido/)
        }
    })

    test('sin nota deja una nota por defecto', () => {
        assert.equal(interpretarResultado('{"resultado":"bloqueada"}').nota, 'Sin detalle.')
    })
})

describe('interpretarSalida', () => {
    test('saca el resultado del campo result de la salida JSON', () => {
        assert.equal(interpretarSalida(respuesta('postulada')).resultado, 'postulada')
    })

    test('una salida que no es JSON, o is_error, queda bloqueada', () => {
        assert.equal(interpretarSalida('boom').resultado, 'bloqueada')
        const error = interpretarSalida(JSON.stringify({ is_error: true, result: 'Chrome no conectado' }))
        assert.equal(error.resultado, 'bloqueada')
        assert.match(error.nota, /Chrome no conectado/)
    })
})

describe('armarPrompt', () => {
    test('incluye la oferta, el perfil, el CV, la carta y las reglas', () => {
        const prompt = armarPrompt({
            oferta: ofertaDePrueba({ carta: 'Hola equipo' }), perfil: 'PERFIL-DE-PRUEBA', rutaCv: 'C:\\cv\\CV.pdf',
        })
        for (const texto of ['https://ejemplo.com/1', 'Soporte Junior', 'ACME', 'LinkedIn', 'Atención al cliente',
            'PERFIL-DE-PRUEBA', 'C:\\cv\\CV.pdf', 'Hola equipo', 'CAPTCHA', 'file_upload', 'tabs_create_mcp', '"resultado"']) {
            assert.ok(prompt.includes(texto), `falta: ${texto}`)
        }
    })
})

describe('crearPostulador', () => {
    let manager
    let carpeta
    let llamadas
    const crear = (ejecutar, extra = {}) => crearPostulador({
        manager,
        ejecutar: async (...args) => { llamadas.push(args[0]); return ejecutar(...args) },
        leerContexto: () => ({ perfil: 'perfil', rutaCv: 'C:\\cv\\CV.pdf' }),
        carpetaSalidas: carpeta,
        ahora: () => AHORA,
        ...extra,
    })

    beforeEach(() => {
        manager = new OfertasManager(conectarDB(':memory:'))
        carpeta = fs.mkdtempSync(path.join(os.tmpdir(), 'empleo-bot-postulador-'))
        llamadas = []
    })
    afterEach(() => fs.rmSync(carpeta, { recursive: true, force: true }))

    test('postulada: pasa a "postulada" con fecha, deja la nota 🤖 y guarda la salida cruda', async () => {
        const id = aceptar(manager)
        await crear(async () => respuesta('postulada', 'Envié la solicitud')).despertar()
        const oferta = manager.obtenerPorId(id)
        assert.equal(oferta.estado, 'postulada')
        assert.ok(oferta.fecha_postulacion)
        assert.equal(oferta.notas, '🤖 18/10: Postulada. Envié la solicitud')
        assert.equal(manager.intentosDelDia(AHORA), 1)
        const archivos = fs.readdirSync(carpeta)
        assert.equal(archivos.length, 1)
        assert.match(archivos[0], new RegExp(`^${id}-.*\\.json$`))
    })

    test('descartada: pasa a "descartada" con el motivo en las notas', async () => {
        const id = aceptar(manager)
        await crear(async () => respuesta('descartada', 'Pide inglés fluido')).despertar()
        assert.equal(manager.obtenerPorId(id).estado, 'descartada')
        assert.match(manager.obtenerPorId(id).notas, /🤖 18\/10: Descartada\. Pide inglés fluido/)
    })

    test('bloqueada: sigue en "por_postular" con el motivo, sale de la fila y no se reintenta sola', async () => {
        const id = aceptar(manager)
        const postulador = crear(async () => respuesta('bloqueada', 'CAPTCHA'))
        await postulador.despertar()
        const oferta = manager.obtenerPorId(id)
        assert.equal(oferta.estado, 'por_postular')
        assert.equal(oferta.bloqueada_motivo, 'CAPTCHA')
        assert.equal(postulador.estado().enFila, 0)
        await postulador.despertar()
        assert.equal(llamadas.length, 1)
    })

    test('si Claude falla o devuelve basura, queda bloqueada con el error', async () => {
        const a = aceptar(manager)
        const b = aceptar(manager, { url: 'https://ejemplo.com/2' })
        const salidas = [async () => { throw new Error('Claude terminó con error: sin sesión') }, async () => salidaDeClaude('nada útil')]
        await crear(() => salidas.shift()()).despertar()
        assert.match(manager.obtenerPorId(a).bloqueada_motivo, /Error: Claude terminó con error: sin sesión/)
        assert.match(manager.obtenerPorId(b).bloqueada_motivo, /no devolvió un resultado válido/)
    })

    test('el timeout deja la oferta bloqueada', async () => {
        const id = aceptar(manager)
        await crear(async () => { throw Object.assign(new Error('se cortó'), { timeout: true, salida: '' }) }, { minutosMaximos: 15 }).despertar()
        assert.match(manager.obtenerPorId(id).bloqueada_motivo, /Timeout: pasaron más de 15 minutos/)
    })

    test('sin CV no lanza Claude: queda bloqueada y no cuenta como intento', async () => {
        const id = aceptar(manager)
        await crear(async () => respuesta('postulada'), { leerContexto: () => ({ perfil: 'p', rutaCv: null }) }).despertar()
        assert.equal(llamadas.length, 0)
        assert.match(manager.obtenerPorId(id).bloqueada_motivo, /No se encontró el CV/)
        assert.equal(manager.intentosDelDia(AHORA), 0)
    })

    test('postula de a una, la más antigua primero, y nunca dos a la vez', async () => {
        aceptar(manager, { url: 'https://ejemplo.com/viejo' })
        manager.guardar(ofertaDePrueba({ url: 'https://ejemplo.com/nuevo' }))
        manager.cambiarEstado(manager.obtenerPorUrl('https://ejemplo.com/nuevo').id, 'por_postular', '2026-10-18T11:00:00.000Z')
        let simultaneas = 0
        let maximo = 0
        const postulador = crear(async () => {
            simultaneas++
            maximo = Math.max(maximo, simultaneas)
            await new Promise(resolve => setTimeout(resolve, 20))
            simultaneas--
            return respuesta('postulada')
        })
        // Tres "despertares" juntos comparten la misma vuelta.
        await Promise.all([postulador.despertar(), postulador.despertar(), postulador.despertar()])
        assert.equal(maximo, 1)
        assert.equal(llamadas.length, 2)
        assert.ok(llamadas[0].includes('/viejo'))
        assert.ok(llamadas[1].includes('/nuevo'))
    })

    test('el estado cuenta la que está en curso y las que esperan', async () => {
        aceptar(manager)
        aceptar(manager, { url: 'https://ejemplo.com/2' })
        let durante
        const postulador = crear(async () => { durante ??= postulador.estado(); return respuesta('postulada') })
        await postulador.despertar()
        assert.equal(durante.enCurso.titulo, 'Soporte Junior')
        assert.equal(durante.enFila, 1)
        assert.deepEqual(postulador.estado(), { enCurso: null, enFila: 0, intentosHoy: 2, limite: 10 })
    })

    test('límite diario: con 10 intentos hoy no postula más, y al día siguiente retoma', async () => {
        for (let i = 0; i < 12; i++) aceptar(manager, { url: `https://ejemplo.com/o${i}` })
        let ahora = AHORA
        const postulador = crear(async () => respuesta('postulada'), { ahora: () => ahora })
        await postulador.despertar()
        assert.equal(llamadas.length, 10)
        assert.equal(postulador.estado().intentosHoy, 10)
        assert.equal(postulador.estado().enFila, 2)
        await postulador.despertar()
        assert.equal(llamadas.length, 10)
        // Al día siguiente el contador vuelve a cero (se cuenta en la base, por día local).
        ahora = new Date(2026, 9, 19, 9, 0)
        await postulador.despertar()
        assert.equal(llamadas.length, 12)
        assert.equal(postulador.estado().intentosHoy, 2)
    })

    test('si la moviste a mano mientras Claude trabajaba, no le pisa el estado (pero deja la nota)', async () => {
        const id = aceptar(manager)
        await crear(async () => {
            manager.cambiarEstado(id, 'me_interesa')
            return respuesta('descartada', 'No calza')
        }).despertar()
        assert.equal(manager.obtenerPorId(id).estado, 'me_interesa')
        assert.match(manager.obtenerPorId(id).notas, /Descartada\. No calza/)
    })

    test('reintentar levanta el bloqueo y la oferta vuelve a la fila', async () => {
        const id = aceptar(manager)
        const respuestas = [respuesta('bloqueada', 'Chrome no conectado'), respuesta('postulada', 'Ahora sí')]
        const postulador = crear(async () => respuestas.shift())
        await postulador.despertar()
        assert.equal(manager.obtenerPorId(id).bloqueada_motivo, 'Chrome no conectado')
        assert.equal(postulador.reintentar(id).bloqueada_motivo, null)
        await postulador.despertar()
        assert.equal(manager.obtenerPorId(id).estado, 'postulada')
        assert.equal(postulador.reintentar(999), null)
        assert.equal(postulador.reintentar(id), null)
    })

    test('cualquier cambio de estado levanta el bloqueo', () => {
        const id = aceptar(manager)
        manager.bloquear(id, 'CAPTCHA')
        manager.cambiarEstado(id, 'me_interesa')
        assert.equal(manager.obtenerPorId(id).bloqueada_motivo, null)
    })
})

describe('API del postulador', () => {
    let servidor
    let base
    let manager
    let despertares

    beforeEach(async () => {
        manager = new OfertasManager(conectarDB(':memory:'))
        despertares = 0
        const postulador = {
            despertar: async () => { despertares++ },
            estado: () => ({ enCurso: null, enFila: manager.contarEnFila(), intentosHoy: 0, limite: 10 }),
            reintentar: id => manager.desbloquear(id),
        }
        servidor = crearApp(manager, {}, {}, postulador).listen(0)
        await new Promise(resolve => servidor.once('listening', resolve))
        base = `http://localhost:${servidor.address().port}/api/ofertas`
    })
    afterEach(() => servidor.close())

    const patch = (id, estado) => fetch(`${base}/${id}/estado`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ estado }),
    })

    test('GET /postulador devuelve el estado', async () => {
        aceptar(manager)
        const { payload } = await (await fetch(`${base}/postulador`)).json()
        assert.deepEqual(payload, { enCurso: null, enFila: 1, intentosHoy: 0, limite: 10 })
    })

    test('pasar una oferta a "por_postular" despierta al postulador; otros estados no', async () => {
        manager.guardar(ofertaDePrueba())
        const { id } = manager.obtenerPorUrl('https://ejemplo.com/1')
        await patch(id, 'me_interesa')
        assert.equal(despertares, 0)
        await patch(id, 'por_postular')
        assert.equal(despertares, 1)
    })

    test('POST /:id/reintentar-postulacion desbloquea; si no está en "por_postular" responde 409', async () => {
        const id = aceptar(manager)
        manager.bloquear(id, 'CAPTCHA')
        const res = await fetch(`${base}/${id}/reintentar-postulacion`, { method: 'POST' })
        assert.equal(res.status, 200)
        assert.equal((await res.json()).payload.bloqueada_motivo, null)

        manager.cambiarEstado(id, 'me_interesa')
        assert.equal((await fetch(`${base}/${id}/reintentar-postulacion`, { method: 'POST' })).status, 409)
        assert.equal((await fetch(`${base}/999/reintentar-postulacion`, { method: 'POST' })).status, 404)
    })
})
