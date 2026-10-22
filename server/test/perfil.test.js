import { test, describe, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { conectarDB } from '../config/db.js'
import { OfertasManager } from '../dao/OfertasManager.js'
import { PerfilManager } from '../dao/PerfilManager.js'
import { crearApp } from '../crearApp.js'
import { nombreCvParaEnvio, normalizarPerfil, perfilATexto, perfilVacio, PERFIL_VACIO } from '../services/perfil.js'
import { armarPrompt } from '../services/postulador-prompt.js'

const PDF = Buffer.from('%PDF-1.4 prueba')
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47])

const perfilDePrueba = () => ({
    personales: { nombre: 'Ana Pérez', telefono: '+54 9 11 1111-2222', direccion: 'Calle 123', codigoPostal: '1000', ciudad: 'CABA', pais: 'Argentina' },
    titulo: 'Soporte Junior',
    habilidades: ['Excel', 'Atención al cliente'],
    experiencias: [
        { tipo: 'trabajo', titulo: 'Operadora', lugar: 'ACME', desde: '2020', hasta: '2024', descripcion: 'Pedidos' },
        { tipo: 'estudio', titulo: 'Técnica', lugar: 'Escuela 1' },
    ],
    idiomas: [{ idioma: 'Inglés', nivel: 'Básico (A2)' }],
    busqueda: { puestos: ['Soporte', 'QA'], sueldo: '900.000', moneda: 'ARS · mensual bruto', noSirve: 'Inglés avanzado' },
    respuestas: [{ pregunta: '¿Título?', respuesta: 'No' }],
})

describe('perfil (reglas puras)', () => {
    test('normalizarPerfil descarta campos desconocidos e ítems vacíos', () => {
        const limpio = normalizarPerfil({
            hackeo: true,
            personales: { nombre: '  Ana  ', clave: 'x' },
            links: [{ nombre: 'Vacío', url: '' }, { nombre: 'GitHub', url: 'https://github.com/ana' }],
            habilidades: ['', 'React', 3],
            experiencias: [{ tipo: 'raro', titulo: 'Dev' }, {}],
        })
        assert.equal(limpio.hackeo, undefined)
        assert.equal(limpio.personales.nombre, 'Ana')
        assert.equal(limpio.personales.clave, undefined)
        assert.deepEqual(limpio.links, [{ nombre: 'GitHub', url: 'https://github.com/ana' }])
        assert.deepEqual(limpio.habilidades, ['React'])
        assert.equal(limpio.experiencias.length, 1)
        assert.equal(limpio.experiencias[0].tipo, 'trabajo')
    })

    test('perfilVacio reconoce el perfil sin datos', () => {
        assert.equal(perfilVacio(PERFIL_VACIO), true)
        assert.equal(perfilVacio(perfilDePrueba()), false)
    })

    test('perfilATexto arma el texto para Claude con todo lo cargado', () => {
        const texto = perfilATexto(perfilDePrueba())
        for (const parte of ['Ana Pérez', 'Calle 123', 'Código postal: 1000', 'Excel, Atención al cliente', 'Operadora · ACME** (2020 – 2024): Pedidos',
            '## Estudios', 'Inglés: Básico (A2)', '1. Soporte', '900.000 ARS · mensual bruto', 'Inglés avanzado', '¿Título? → No', '## Cómo puntuar']) {
            assert.ok(texto.includes(parte), `falta: ${parte}`)
        }
        // Lo que no se cargó no aparece como línea vacía.
        assert.ok(!texto.includes('DNI'))
    })

    test('el prompt del postulador usa el nombre del perfil', () => {
        const prompt = armarPrompt({ oferta: { url: 'https://x', titulo: 'QA' }, perfil: 'P', rutaCv: 'C:\\cv.pdf', nombre: 'Ana Pérez' })
        assert.ok(prompt.includes('postulador automático de Ana Pérez'))
        assert.ok(!prompt.includes('Deiber'))
    })
})

describe('perfil: niveles y nombre del CV', () => {
    test('un perfil viejo sin niveles se lee como [] y los desconocidos se descartan', () => {
        assert.deepEqual(normalizarPerfil({ busqueda: { puestos: ['QA'] } }).busqueda.niveles, [])
        assert.deepEqual(PERFIL_VACIO.busqueda.niveles, [])
        const limpio = normalizarPerfil({ busqueda: { niveles: ['Senior', 'Junior', 'Dios', 'Junior'] } })
        assert.deepEqual(limpio.busqueda.niveles, ['Junior', 'Senior'])
    })

    test('perfilATexto dice los niveles que busca, o que son todos', () => {
        assert.match(perfilATexto({ ...perfilDePrueba(), busqueda: { niveles: ['Junior', 'Semi senior'] } }), /Niveles que busca: Junior, Semi senior/)
        assert.match(perfilATexto(perfilDePrueba()), /Niveles que busca: Todos los niveles/)
    })

    test('nombreCvParaEnvio saca rutas y caracteres prohibidos, y usa CV.pdf si no queda nada', () => {
        assert.equal(nombreCvParaEnvio('Ana Pérez - CV.pdf'), 'Ana Pérez - CV.pdf')
        assert.equal(nombreCvParaEnvio('C:' + String.fromCharCode(92) + 'Users' + String.fromCharCode(92) + 'ana' + String.fromCharCode(92) + 'cv.pdf'), 'cv.pdf')
        assert.equal(nombreCvParaEnvio('../../etc/cv.pdf'), 'cv.pdf')
        assert.equal(nombreCvParaEnvio('a:b*c?d"e<f>g|h.pdf'), 'abcdefgh.pdf')
        assert.equal(nombreCvParaEnvio('..pdf. '), 'pdf')
        for (const vacio of ['', '   ', '...', '???', undefined, null]) assert.equal(nombreCvParaEnvio(vacio), 'CV.pdf')
    })
})

describe('PerfilManager', () => {
    let manager
    let carpeta
    beforeEach(() => {
        carpeta = fs.mkdtempSync(path.join(os.tmpdir(), 'perfil-'))
        manager = new PerfilManager(conectarDB(':memory:'), carpeta)
    })
    afterEach(() => fs.rmSync(carpeta, { recursive: true, force: true }))

    test('arranca vacío y textoParaClaude avisa que hay que completarlo', () => {
        assert.equal(manager.obtener().tieneFoto, false)
        assert.throws(() => manager.textoParaClaude(), /pestaña Perfil/)
    })

    test('guarda y vuelve a leer los datos', () => {
        manager.guardar(perfilDePrueba())
        assert.equal(manager.obtener().datos.personales.nombre, 'Ana Pérez')
        assert.match(manager.textoParaClaude(), /Ana Pérez/)
    })

    test('el primer CV queda predeterminado y al quitarlo pasa al siguiente', () => {
        const primero = manager.agregarCv({ contenido: PDF, nombreOriginal: 'cv-dev.pdf' }, new Date('2026-10-01'))
        const segundo = manager.agregarCv({ contenido: PDF, nombreOriginal: 'cv-soporte.pdf' }, new Date('2026-10-02'))
        assert.equal(primero.predeterminado, true)
        assert.equal(segundo.predeterminado, false)
        assert.equal(primero.nombre, 'cv-dev')

        manager.marcarPredeterminado(segundo.id)
        assert.equal(manager.rutaCvPredeterminado(), path.join(carpeta, segundo.archivo))
        assert.equal(manager.obtenerCv(primero.id).predeterminado, false)

        manager.quitarCv(segundo.id)
        assert.equal(fs.existsSync(path.join(carpeta, segundo.archivo)), false)
        assert.equal(manager.obtenerCv(primero.id).predeterminado, true)
    })

    test('rutaCvParaEnvio copia el CV predeterminado con su nombre original y deja la carpeta con un solo archivo', () => {
        assert.equal(manager.rutaCvParaEnvio(), null)
        const primero = manager.agregarCv({ contenido: PDF, nombreOriginal: 'Ana Pérez - CV.pdf' }, new Date('2026-10-01'))
        const segundo = manager.agregarCv({ contenido: Buffer.from('%PDF-1.4 otro'), nombreOriginal: 'CV Soporte.pdf' }, new Date('2026-10-02'))

        const ruta = manager.rutaCvParaEnvio()
        assert.equal(ruta, path.join(carpeta, 'envio', 'Ana Pérez - CV.pdf'))
        assert.deepEqual(fs.readFileSync(ruta), PDF)

        manager.marcarPredeterminado(segundo.id)
        const otra = manager.rutaCvParaEnvio()
        assert.equal(path.basename(otra), 'CV Soporte.pdf')
        assert.deepEqual(fs.readdirSync(path.join(carpeta, 'envio')), ['CV Soporte.pdf'])
        // Los archivos guardados no se tocan.
        assert.equal(fs.existsSync(path.join(carpeta, primero.archivo)), true)
        assert.equal(fs.existsSync(path.join(carpeta, segundo.archivo)), true)
    })

    test('cambiar la foto borra la anterior', () => {
        manager.guardarFoto(PNG, 'image/png', new Date('2026-10-01'))
        const vieja = manager.rutaFoto()
        manager.guardarFoto(PNG, 'image/png', new Date('2026-10-02'))
        assert.equal(fs.existsSync(vieja), false)
        assert.equal(fs.existsSync(manager.rutaFoto()), true)
        assert.equal(manager.obtener().tieneFoto, true)
    })
})

describe('API /api/perfil', () => {
    let servidor
    let base
    let carpeta
    beforeEach(async () => {
        carpeta = fs.mkdtempSync(path.join(os.tmpdir(), 'perfil-api-'))
        const db = conectarDB(':memory:')
        const app = crearApp(new OfertasManager(db), {}, null, null, new PerfilManager(db, carpeta))
        servidor = app.listen(0)
        await new Promise(resolve => servidor.once('listening', resolve))
        base = `http://localhost:${servidor.address().port}/api/perfil`
    })
    afterEach(() => {
        servidor.close()
        fs.rmSync(carpeta, { recursive: true, force: true })
    })

    test('PUT guarda y GET devuelve el perfil limpio', async () => {
        const guardado = await fetch(base, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(perfilDePrueba()) })
        assert.equal(guardado.status, 200)
        const { payload } = await (await fetch(base)).json()
        assert.equal(payload.datos.personales.codigoPostal, '1000')
        assert.deepEqual(payload.cvs, [])
    })

    test('sube un CV, lo devuelve como PDF y rechaza lo que no es PDF', async () => {
        const subido = await fetch(`${base}/cvs`, { method: 'POST', headers: { 'Content-Type': 'application/pdf', 'X-Nombre-Archivo': encodeURIComponent('Mi CV ñ.pdf') }, body: PDF })
        assert.equal(subido.status, 201)
        const [cv] = (await subido.json()).payload.cvs
        assert.equal(cv.nombre_original, 'Mi CV ñ.pdf')
        assert.equal(cv.predeterminado, true)

        const ver = await fetch(`${base}/cvs/${cv.id}`)
        assert.equal(ver.headers.get('content-type'), 'application/pdf')
        assert.deepEqual(Buffer.from(await ver.arrayBuffer()), PDF)

        const falso = await fetch(`${base}/cvs`, { method: 'POST', headers: { 'Content-Type': 'application/pdf' }, body: 'no soy un pdf' })
        assert.equal(falso.status, 400)
    })

    test('renombra y quita un CV', async () => {
        const { payload } = await (await fetch(`${base}/cvs`, { method: 'POST', headers: { 'Content-Type': 'application/pdf' }, body: PDF })).json()
        const id = payload.cvs[0].id
        const renombrado = await (await fetch(`${base}/cvs/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ nombre: 'CV Soporte' }) })).json()
        assert.equal(renombrado.payload.cvs[0].nombre, 'CV Soporte')
        const vacio = await fetch(`${base}/cvs/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ nombre: ' ' }) })
        assert.equal(vacio.status, 400)
        assert.equal((await fetch(`${base}/cvs/${id}`, { method: 'DELETE' })).status, 200)
        assert.equal((await fetch(`${base}/cvs/${id}`, { method: 'DELETE' })).status, 404)
    })

    test('sube la foto y la sirve; sin foto responde 404', async () => {
        assert.equal((await fetch(`${base}/foto`)).status, 404)
        const subida = await fetch(`${base}/foto`, { method: 'PUT', headers: { 'Content-Type': 'image/png' }, body: PNG })
        assert.equal((await subida.json()).payload.tieneFoto, true)
        const foto = await fetch(`${base}/foto`)
        assert.equal(foto.status, 200)
        const texto = await fetch(`${base}/foto`, { method: 'PUT', headers: { 'Content-Type': 'text/plain' }, body: 'hola' })
        assert.equal(texto.status, 400)
    })
})
