import { conectarDB } from './config/db.js'
import { OfertasManager } from './dao/OfertasManager.js'
import { crearApp } from './crearApp.js'
import { crearEscritorDeCartas, crearEscritorDeMensajeCorto, crearEscritorDeSeguimiento } from './services/cartas.js'
import { crearRevisorDeGmail, revisarCadaRato, MINUTOS_ENTRE_REVISIONES } from './services/gmail.js'
import { buscarCuandoToque, crearBuscador, HORAS_ENTRE_BUSQUEDAS } from './services/busqueda.js'

const PUERTO = process.env.PORT || 3001

// Primero la base y recién después escuchar: así nunca llega un pedido sin la base lista.
const db = conectarDB()
const manager = new OfertasManager(db)
const revisarGmail = crearRevisorDeGmail()
const buscador = crearBuscador()
const app = crearApp(manager, {
    escribirCarta: crearEscritorDeCartas(),
    escribirSeguimiento: crearEscritorDeSeguimiento(),
    escribirMensajeCorto: crearEscritorDeMensajeCorto(),
    revisarGmail,
}, buscador)

app.listen(PUERTO, () => {
    console.log(`API de empleo-bot en http://localhost:${PUERTO}`)
    // Mientras la app está abierta, el seguimiento por Gmail corre solo (además del de n8n).
    revisarCadaRato(revisarGmail)
    console.log(`Gmail: se revisa al abrir y cada ${MINUTOS_ENTRE_REVISIONES} minutos`)
    // Y la búsqueda de ofertas: al abrir, si pasaron 12 horas desde la última, y después cada 12 horas.
    buscarCuandoToque({ buscar: buscador.buscar, ultimaBusqueda: () => manager.ultimaBusqueda() })
    console.log(`Búsqueda de ofertas: sola cada ${HORAS_ENTRE_BUSQUEDAS} horas mientras la app esté abierta`)
})
