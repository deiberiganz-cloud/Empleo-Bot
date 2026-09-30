import { Router } from 'express'
import { ESTADOS } from '../config/db.js'

const errorEstado = `Estado inválido. Usá: ${ESTADOS.join(', ')}`
const LARGO_MAXIMO_TEXTO = 10000

const idInvalido = res => res.status(400).json({ status: 'error', error: 'El id tiene que ser un número' })
const noEncontrada = res => res.status(404).json({ status: 'error', error: 'Oferta no encontrada' })

/**
 * Valida un texto del body (carta o notas): tiene que ser string y no demasiado largo.
 * @returns el mensaje de error, o null si está bien
 */
const errorDeTexto = (valor, campo) => {
    if (typeof valor !== 'string') return `Falta el campo "${campo}" (texto)`
    if (valor.length > LARGO_MAXIMO_TEXTO) return `"${campo}" no puede superar los ${LARGO_MAXIMO_TEXTO} caracteres`
    return null
}

// El manager y el escritor de cartas se reciben por parámetro (inyección) en vez de importarlos:
// así los tests usan una base en memoria y un Claude de mentira, y no hay dependencias circulares.
export const crearOfertasRouter = (manager, escribirCarta) => {
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

    // Claude escribe la carta para esta oferta y queda guardada (reemplaza la anterior).
    router.post('/:id/carta', async (req, res) => {
        const id = Number(req.params.id)
        if (!Number.isInteger(id)) return idInvalido(res)
        const oferta = manager.obtenerPorId(id)
        if (!oferta) return noEncontrada(res)
        try {
            const carta = await escribirCarta(oferta)
            res.json({ status: 'success', payload: manager.guardarCarta(id, carta) })
        } catch (error) {
            console.error(error)
            res.status(500).json({ status: 'error', error: `No se pudo escribir la carta: ${error.message}` })
        }
    })

    // Guarda la carta editada a mano.
    router.patch('/:id/carta', (req, res) => {
        const id = Number(req.params.id)
        if (!Number.isInteger(id)) return idInvalido(res)
        const error = errorDeTexto(req.body?.carta, 'carta')
        if (error) return res.status(400).json({ status: 'error', error })
        try {
            const oferta = manager.guardarCarta(id, req.body.carta)
            if (!oferta) return noEncontrada(res)
            res.json({ status: 'success', payload: oferta })
        } catch (error) {
            console.error(error)
            res.status(500).json({ status: 'error', error: 'Error al guardar la carta' })
        }
    })

    router.patch('/:id/notas', (req, res) => {
        const id = Number(req.params.id)
        if (!Number.isInteger(id)) return idInvalido(res)
        const error = errorDeTexto(req.body?.notas, 'notas')
        if (error) return res.status(400).json({ status: 'error', error })
        try {
            const oferta = manager.guardarNotas(id, req.body.notas)
            if (!oferta) return noEncontrada(res)
            res.json({ status: 'success', payload: oferta })
        } catch (error) {
            console.error(error)
            res.status(500).json({ status: 'error', error: 'Error al guardar las notas' })
        }
    })

    return router
}
