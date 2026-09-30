import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { conectarDB } from '../config/db.js'
import { crearEscritorDeCartas } from '../services/cartas.js'

const oferta = { titulo: 'Soporte Técnico', empresa: 'ACME', ubicacion: 'Remoto', descripcion: 'Atender tickets' }

test('el escritor de cartas le pasa a Claude el perfil, la oferta y las reglas', async () => {
    let promptRecibido = ''
    const escribir = crearEscritorDeCartas({
        leerPerfil: () => '# Perfil de prueba',
        preguntar: async prompt => {
            promptRecibido = prompt
            return '  Hola, soy la carta  '
        },
    })
    const carta = await escribir(oferta)
    assert.equal(carta, '  Hola, soy la carta  ')
    assert.match(promptRecibido, /# Perfil de prueba/)
    assert.match(promptRecibido, /Empresa: ACME/)
    assert.match(promptRecibido, /NADA inventado/)
})

test('el escritor de cartas falla si Claude devuelve una carta vacía', async () => {
    const escribir = crearEscritorDeCartas({ leerPerfil: () => '', preguntar: async () => '' })
    await assert.rejects(escribir(oferta), /carta vacía/)
})

test('conectarDB agrega la columna "carta" a una base vieja sin perder datos', () => {
    const archivo = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'empleo-bot-')), 'vieja.db')
    const vieja = new DatabaseSync(archivo)
    vieja.exec(`CREATE TABLE ofertas (id INTEGER PRIMARY KEY, url TEXT NOT NULL UNIQUE, titulo TEXT NOT NULL,
        encontrada TEXT NOT NULL, estado TEXT NOT NULL DEFAULT 'nueva', notas TEXT)`)
    vieja.exec(`INSERT INTO ofertas (url, titulo, encontrada) VALUES ('https://x.com', 'Vieja', '2026-09-30')`)
    vieja.close()

    const db = conectarDB(archivo)
    const columnas = db.prepare('PRAGMA table_info(ofertas)').all().map(c => c.name)
    assert.ok(columnas.includes('carta'))
    assert.equal(db.prepare('SELECT titulo FROM ofertas').get().titulo, 'Vieja')
    db.close()
})
