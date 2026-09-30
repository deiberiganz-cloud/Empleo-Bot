// Pasa las ofertas de data/ofertas.json (formato viejo) a la base SQLite.
// Se puede correr varias veces: las que ya están no se duplican ni se pisan.
import fs from 'node:fs'
import path from 'node:path'
import { conectarDB, RUTA_DB_POR_DEFECTO } from '../config/db.js'
import { OfertasManager } from '../dao/OfertasManager.js'

const carpetaData = path.dirname(RUTA_DB_POR_DEFECTO)
const leerJson = archivo => {
    try {
        return JSON.parse(fs.readFileSync(path.join(carpetaData, archivo), 'utf8'))
    } catch {
        return []
    }
}

const ofertas = leerJson('ofertas.json')
// ofertas.json no guardó la descripción: la recuperamos de entrada.json por url.
const descripciones = new Map(leerJson('entrada.json').map(o => [o.url, o.descripcion]))

const manager = new OfertasManager(conectarDB())
let nuevas = 0
for (const oferta of ofertas) {
    if (manager.guardar({ ...oferta, descripcion: oferta.descripcion ?? descripciones.get(oferta.url) })) nuevas++
}
console.log(`Ofertas en el JSON: ${ofertas.length} · nuevas en la base: ${nuevas} · ya estaban: ${ofertas.length - nuevas}`)
