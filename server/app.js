import { conectarDB } from './config/db.js'
import { OfertasManager } from './dao/OfertasManager.js'
import { crearApp } from './crearApp.js'
import { crearEscritorDeCartas, crearEscritorDeMensajeCorto, crearEscritorDeSeguimiento } from './services/cartas.js'
import { crearRevisorDeGmail, revisarCadaRato, MINUTOS_ENTRE_REVISIONES } from './services/gmail.js'

const PUERTO = process.env.PORT || 3001

// Primero la base y recién después escuchar: así nunca llega un pedido sin la base lista.
const db = conectarDB()
const revisarGmail = crearRevisorDeGmail()
const app = crearApp(new OfertasManager(db), {
    escribirCarta: crearEscritorDeCartas(),
    escribirSeguimiento: crearEscritorDeSeguimiento(),
    escribirMensajeCorto: crearEscritorDeMensajeCorto(),
    revisarGmail,
})

app.listen(PUERTO, () => {
    console.log(`API de empleo-bot en http://localhost:${PUERTO}`)
    // Mientras la app está abierta, el seguimiento por Gmail corre solo (además del de n8n).
    revisarCadaRato(revisarGmail)
    console.log(`Gmail: se revisa al abrir y cada ${MINUTOS_ENTRE_REVISIONES} minutos`)
})
