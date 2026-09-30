import { Router } from 'express'
import { ESTADOS } from '../config/db.js'

const errorEstado = `Estado inválido. Usá: ${ESTADOS.join(', ')}`

// El manager se recibe por parámetro (inyección) en vez de importarlo:
// así los tests usan una base en memoria y no hay dependencias circulares.
export const crearOfertasRouter = manager => {
    const router = Router()

    router.get('/', (req, res) => {
        const { estado, tipo } = req.query
        if (estado && !ESTADOS.includes(estado)) {
            return res.status(400).json({ status: 'error', error: errorEstado })
        }
        try {
            res.json({ status: 'success', payload: manager.listar({ estado, tipo }) })
        } catch (error) {
            console.error(error)
            res.status(500).json({ status: 'error', error: 'Error al listar las ofertas' })
        }
    })

    router.get('/:id', (req, res) => {
        const id = Number(req.params.id)
        if (!Number.isInteger(id)) {
            return res.status(400).json({ status: 'error', error: 'El id tiene que ser un número' })
        }
        try {
            const oferta = manager.obtenerPorId(id)
            if (!oferta) return res.status(404).json({ status: 'error', error: 'Oferta no encontrada' })
            res.json({ status: 'success', payload: oferta })
        } catch (error) {
            console.error(error)
            res.status(500).json({ status: 'error', error: 'Error al buscar la oferta' })
        }
    })

    router.patch('/:id/estado', (req, res) => {
        const id = Number(req.params.id)
        const estado = req.body?.estado
        if (!Number.isInteger(id)) {
            return res.status(400).json({ status: 'error', error: 'El id tiene que ser un número' })
        }
        if (!ESTADOS.includes(estado)) {
            return res.status(400).json({ status: 'error', error: errorEstado })
        }
        try {
            const oferta = manager.cambiarEstado(id, estado)
            if (!oferta) return res.status(404).json({ status: 'error', error: 'Oferta no encontrada' })
            res.json({ status: 'success', payload: oferta })
        } catch (error) {
            console.error(error)
            res.status(500).json({ status: 'error', error: 'Error al cambiar el estado' })
        }
    })

    return router
}
