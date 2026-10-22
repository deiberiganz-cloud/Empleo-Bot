import { CARPETA_PERFIL_POR_DEFECTO, conectarDB } from './config/db.js'
import { OfertasManager } from './dao/OfertasManager.js'
import { PerfilManager } from './dao/PerfilManager.js'
import { crearApp } from './crearApp.js'
import { crearEscritorDeCartas, crearEscritorDeMensajeCorto, crearEscritorDeSeguimiento } from './services/cartas.js'
import { crearRevisorDeGmail, revisarCadaRato, MINUTOS_ENTRE_REVISIONES } from './services/gmail.js'
import { crearPostulador } from './services/postulador.js'
import { buscarCuandoToque, crearBuscador, HORAS_ENTRE_BUSQUEDAS } from './services/busqueda.js'

const PUERTO = process.env.PORT || 3001

// Primero la base y recién después escuchar: así nunca llega un pedido sin la base lista.
const db = conectarDB()
const manager = new OfertasManager(db)
const revisarGmail = crearRevisorDeGmail()
const buscador = crearBuscador()
const perfilManager = new PerfilManager(db, CARPETA_PERFIL_POR_DEFECTO)
// Claude (cartas, mensajes y postulador) lee el perfil y el CV de la pestaña Perfil en el momento:
// lo que se cambia ahí se nota en la próxima carta o postulación, sin reiniciar.
const leerPerfil = () => perfilManager.textoParaClaude()
const postulador = crearPostulador({
    manager,
    leerContexto: () => ({
        perfil: leerPerfil(),
        rutaCv: perfilManager.rutaCvParaEnvio(),
        nombre: perfilManager.obtener().datos.personales.nombre || undefined,
    }),
})
const app = crearApp(manager, {
    escribirCarta: crearEscritorDeCartas({ leerPerfil }),
    escribirSeguimiento: crearEscritorDeSeguimiento({ leerPerfil }),
    escribirMensajeCorto: crearEscritorDeMensajeCorto({ leerPerfil }),
    revisarGmail,
}, buscador, postulador, perfilManager)

app.listen(PUERTO, () => {
    console.log(`API de empleo-bot en http://localhost:${PUERTO}`)
    // Mientras la app está abierta, el seguimiento por Gmail corre solo.
    revisarCadaRato(revisarGmail)
    console.log(`Gmail: se revisa al abrir y cada ${MINUTOS_ENTRE_REVISIONES} minutos`)
    // Y la búsqueda de ofertas: al abrir, si pasaron 4 horas desde la última, y después cada 4 horas.
    buscarCuandoToque({ buscar: buscador.buscar, ultimaBusqueda: () => manager.ultimaBusqueda() })
    // Y el postulador: retoma lo que haya quedado en "Por postular" (Claude postula con tu Chrome, de a una).
    postulador.arrancar()
    console.log('Postulador: las ofertas en "Por postular" se postulan solas, de a una')
    console.log(`Búsqueda de ofertas: sola cada ${HORAS_ENTRE_BUSQUEDAS} horas mientras la app esté abierta`)
})
