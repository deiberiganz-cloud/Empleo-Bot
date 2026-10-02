import { Router } from 'express'
import { proximaBusqueda } from '../services/busqueda.js'

/**
 * Búsqueda de ofertas: cómo fue la última y el botón "Buscar ahora".
 * @param manager el OfertasManager (de ahí sale la última búsqueda)
 * @param buscador { buscar, enCurso, ultimoError } (ver services/busqueda.js)
 */
export const crearBusquedaRouter = (manager, buscador) => {
    const router = Router()

    const estado = () => {
        const ultima = manager.ultimaBusqueda()
        return {
            ultima,
            enCurso: buscador.enCurso(),
            error: buscador.ultimoError(),
            proxima: proximaBusqueda(ultima),
        }
    }

    router.get('/', (req, res) => {
        try {
            res.json({ status: 'success', payload: estado() })
        } catch (error) {
            console.error(error)
            res.status(500).json({ status: 'error', error: 'Error al leer la última búsqueda' })
        }
    })

    // "Buscar ahora": arranca la búsqueda y responde enseguida (tarda unos minutos).
    // La pantalla pregunta cada tanto con GET hasta que enCurso vuelve a false.
    router.post('/', (req, res) => {
        try {
            buscador.buscar().catch(error => console.error(`Buscar ahora: ${error.message}`))
            res.status(202).json({ status: 'success', payload: estado() })
        } catch (error) {
            console.error(error)
            res.status(500).json({ status: 'error', error: `No se pudo empezar la búsqueda: ${error.message}` })
        }
    })

    return router
}
