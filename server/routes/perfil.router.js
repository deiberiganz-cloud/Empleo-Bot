import express, { Router } from 'express'
import { TIPOS_FOTO } from '../dao/PerfilManager.js'

const MB = 1024 * 1024
// Los archivos llegan "crudos" en el cuerpo del pedido (sin multer ni formularios multipart):
// el tipo va en Content-Type y el nombre original en el encabezado X-Nombre-Archivo.
const recibirFoto = express.raw({ type: Object.keys(TIPOS_FOTO), limit: 5 * MB })
const recibirPdf = express.raw({ type: 'application/pdf', limit: 10 * MB })

const idInvalido = res => res.status(400).json({ status: 'error', error: 'El id tiene que ser un número' })
const cvNoEncontrado = res => res.status(404).json({ status: 'error', error: 'CV no encontrado' })
const sinArchivo = (req) => !Buffer.isBuffer(req.body) || req.body.length === 0

// Un PDF de verdad empieza con "%PDF": así no se guarda cualquier cosa con la extensión cambiada.
const esPdf = contenido => contenido.subarray(0, 4).toString('latin1') === '%PDF'

/** Lo que devuelve GET /api/perfil: los datos, si hay foto y la lista de CV. */
const respuestaPerfil = perfilManager => ({ ...perfilManager.obtener(), cvs: perfilManager.listarCvs() })

/**
 * Rutas de la pestaña Perfil. El manager se recibe por parámetro (inyección): los tests usan
 * una base en memoria y una carpeta temporal.
 * @param perfilManager el PerfilManager
 */
export const crearPerfilRouter = perfilManager => {
    const router = Router()

    const conErrores = (mensaje, accion) => (req, res) => {
        try {
            accion(req, res)
        } catch (error) {
            console.error(error)
            res.status(500).json({ status: 'error', error: mensaje })
        }
    }

    router.get('/', conErrores('Error al leer el perfil', (req, res) => {
        res.json({ status: 'success', payload: respuestaPerfil(perfilManager) })
    }))

    // Guarda todo el formulario de una vez (lo que no se conoce se descarta en normalizarPerfil).
    router.put('/', conErrores('Error al guardar el perfil', (req, res) => {
        if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
            return res.status(400).json({ status: 'error', error: 'Faltan los datos del perfil' })
        }
        perfilManager.guardar(req.body)
        res.json({ status: 'success', payload: respuestaPerfil(perfilManager) })
    }))

    router.get('/foto', conErrores('Error al leer la foto', (req, res) => {
        const ruta = perfilManager.rutaFoto()
        if (!ruta) return res.status(404).json({ status: 'error', error: 'Todavía no hay foto de perfil' })
        res.sendFile(ruta)
    }))

    router.put('/foto', recibirFoto, conErrores('Error al guardar la foto', (req, res) => {
        if (sinArchivo(req)) {
            return res.status(400).json({ status: 'error', error: 'La foto tiene que ser JPG, PNG o WebP (máximo 5 MB)' })
        }
        perfilManager.guardarFoto(req.body, req.get('Content-Type').split(';')[0])
        res.json({ status: 'success', payload: respuestaPerfil(perfilManager) })
    }))

    router.post('/cvs', recibirPdf, conErrores('Error al guardar el CV', (req, res) => {
        if (sinArchivo(req) || !esPdf(req.body)) {
            return res.status(400).json({ status: 'error', error: 'El CV tiene que ser un PDF (máximo 10 MB)' })
        }
        const nombreOriginal = decodeURIComponent(req.get('X-Nombre-Archivo') ?? '') || 'CV.pdf'
        perfilManager.agregarCv({ contenido: req.body, nombreOriginal })
        res.status(201).json({ status: 'success', payload: respuestaPerfil(perfilManager) })
    }))

    // "Ver": el PDF tal cual, para abrirlo en otra pestaña.
    router.get('/cvs/:id', conErrores('Error al leer el CV', (req, res) => {
        const id = Number(req.params.id)
        if (!Number.isInteger(id)) return idInvalido(res)
        const cv = perfilManager.obtenerCv(id)
        if (!cv) return cvNoEncontrado(res)
        res.type('application/pdf')
        res.set('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(cv.nombre_original)}`)
        res.sendFile(perfilManager.rutaCv(id))
    }))

    router.patch('/cvs/:id', conErrores('Error al cambiar el CV', (req, res) => {
        const id = Number(req.params.id)
        if (!Number.isInteger(id)) return idInvalido(res)
        if (!perfilManager.obtenerCv(id)) return cvNoEncontrado(res)
        const { nombre, predeterminado } = req.body ?? {}
        if (nombre !== undefined && (typeof nombre !== 'string' || !nombre.trim())) {
            return res.status(400).json({ status: 'error', error: 'El nombre del CV no puede quedar vacío' })
        }
        if (nombre !== undefined) perfilManager.renombrarCv(id, nombre)
        if (predeterminado === true) perfilManager.marcarPredeterminado(id)
        res.json({ status: 'success', payload: respuestaPerfil(perfilManager) })
    }))

    router.delete('/cvs/:id', conErrores('Error al quitar el CV', (req, res) => {
        const id = Number(req.params.id)
        if (!Number.isInteger(id)) return idInvalido(res)
        if (!perfilManager.quitarCv(id)) return cvNoEncontrado(res)
        res.json({ status: 'success', payload: respuestaPerfil(perfilManager) })
    }))

    return router
}
