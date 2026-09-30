import { conectarDB } from './config/db.js'
import { OfertasManager } from './dao/OfertasManager.js'
import { crearApp } from './crearApp.js'

const PUERTO = process.env.PORT || 3001

// Primero la base y recién después escuchar: así nunca llega un pedido sin la base lista.
const db = conectarDB()
const app = crearApp(new OfertasManager(db))

app.listen(PUERTO, () => console.log(`API de empleo-bot en http://localhost:${PUERTO}`))
