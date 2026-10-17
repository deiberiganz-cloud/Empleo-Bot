import { test } from 'node:test'
import assert from 'node:assert/strict'
import { DatabaseSync } from 'node:sqlite'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { conectarDB } from '../config/db.js'
import { OfertasManager } from '../dao/OfertasManager.js'

test('una base de antes de "por_postular" se rehace sin perder datos y acepta el estado nuevo', () => {
    const carpeta = fs.mkdtempSync(path.join(os.tmpdir(), 'empleo-bot-'))
    const ruta = path.join(carpeta, 'vieja.db')
    // La tabla como estaba antes: el CHECK no conoce "por_postular" y faltan columnas agregadas después.
    const vieja = new DatabaseSync(ruta)
    vieja.exec(`
        CREATE TABLE ofertas (
            id INTEGER PRIMARY KEY AUTOINCREMENT, url TEXT NOT NULL UNIQUE, titulo TEXT NOT NULL,
            empresa TEXT, fuente TEXT, ubicacion TEXT, descripcion TEXT, fecha_publicacion TEXT,
            encontrada TEXT NOT NULL, puntaje INTEGER, tipo TEXT, motivo TEXT,
            postular INTEGER NOT NULL DEFAULT 0, estafa INTEGER NOT NULL DEFAULT 0,
            estado TEXT NOT NULL DEFAULT 'nueva'
                CHECK (estado IN ('nueva', 'me_interesa', 'descartada', 'postulada', 'entrevista', 'oferta', 'rechazada')),
            estado_actualizado TEXT, notas TEXT
        );
        INSERT INTO ofertas (id, url, titulo, encontrada, estado, notas) VALUES (7, 'u/1', 'Soporte', '2026-10-16', 'me_interesa', 'mi nota');
    `)
    vieja.close()

    const db = conectarDB(ruta)
    const manager = new OfertasManager(db)
    const oferta = manager.obtenerPorId(7)
    assert.equal(oferta.url, 'u/1')
    assert.equal(oferta.notas, 'mi nota')
    assert.equal(manager.cambiarEstado(7, 'por_postular').estado, 'por_postular')
    // Las nuevas siguen numerándose después de las que había.
    manager.guardar({ url: 'u/2', titulo: 'QA', encontrada: '2026-10-17', postular: false, estafa: false })
    assert.equal(manager.obtenerPorUrl('u/2').id, 8)
    db.close()
    // Abrirla otra vez no la vuelve a rehacer ni rompe nada.
    conectarDB(ruta).close()
    fs.rmSync(carpeta, { recursive: true, force: true })
})
