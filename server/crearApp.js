import express from 'express'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { crearBusquedaRouter } from './routes/busqueda.router.js'
import { crearOfertasRouter } from './routes/ofertas.router.js'

// La pantalla ya compilada (npm run build en web/). Si existe, la API también la sirve:
// así para usar la app alcanza con un solo programa y un solo puerto.
const RUTA_WEB = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'web', 'dist')

/**
 * Arma la app de Express sin ponerla a escuchar, así los tests la levantan aparte.
 * @param manager el OfertasManager
 * @param escritores { escribirCarta, escribirSeguimiento, escribirMensajeCorto }: funciones async (oferta) => texto,
 *   y revisarGmail: async () => { acciones, errores }
 * @param buscador { buscar, enCurso, ultimoError } (ver services/busqueda.js)
 */
export const crearApp = (manager, escritores, buscador) => {
    const app = express()
    app.use(express.json())

    app.get('/api/salud', (req, res) => res.json({ status: 'success', payload: 'ok' }))
    app.use('/api/ofertas', crearOfertasRouter(manager, escritores))
    app.use('/api/busqueda', crearBusquedaRouter(manager, buscador))

    if (fs.existsSync(RUTA_WEB)) app.use(express.static(RUTA_WEB))

    return app
}
