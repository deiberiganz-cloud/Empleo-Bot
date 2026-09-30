import express from 'express'
import { crearOfertasRouter } from './routes/ofertas.router.js'

/**
 * Arma la app de Express sin ponerla a escuchar, así los tests la levantan aparte.
 */
export const crearApp = manager => {
    const app = express()
    app.use(express.json())

    app.get('/api/salud', (req, res) => res.json({ status: 'success', payload: 'ok' }))
    app.use('/api/ofertas', crearOfertasRouter(manager))

    return app
}
