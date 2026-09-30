import { DatabaseSync } from 'node:sqlite'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const carpetaServer = path.dirname(path.dirname(fileURLToPath(import.meta.url)))

// La base vive en empleo-bot/data/, que está fuera del repo (datos personales).
export const RUTA_DB_POR_DEFECTO = path.join(carpetaServer, '..', 'data', 'empleo.db')

// Todos los estados posibles de una oferta, del primero al último.
// Los de seguimiento (entrevista, oferta, rechazada) se usan en la etapa C.
export const ESTADOS = ['nueva', 'me_interesa', 'descartada', 'postulada', 'entrevista', 'oferta', 'rechazada']

const ESQUEMA = `
    CREATE TABLE IF NOT EXISTS ofertas (
        id                 INTEGER PRIMARY KEY AUTOINCREMENT,
        url                TEXT    NOT NULL UNIQUE,
        titulo             TEXT    NOT NULL,
        empresa            TEXT,
        fuente             TEXT,
        ubicacion          TEXT,
        descripcion        TEXT,
        fecha_publicacion  TEXT,
        encontrada         TEXT    NOT NULL,
        puntaje            INTEGER,
        tipo               TEXT,
        motivo             TEXT,
        postular           INTEGER NOT NULL DEFAULT 0,
        estafa             INTEGER NOT NULL DEFAULT 0,
        estado             TEXT    NOT NULL DEFAULT 'nueva'
                           CHECK (estado IN (${ESTADOS.map(e => `'${e}'`).join(', ')})),
        estado_actualizado TEXT,
        notas              TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_ofertas_estado ON ofertas (estado);
`

/**
 * Abre la base SQLite y crea las tablas si no existen.
 * @param {string} ruta Ruta del archivo, o ':memory:' para los tests.
 * @returns {DatabaseSync}
 */
export const conectarDB = (ruta = process.env.DB_PATH || RUTA_DB_POR_DEFECTO) => {
    const db = new DatabaseSync(ruta)
    db.exec('PRAGMA journal_mode = WAL;')
    db.exec(ESQUEMA)
    return db
}
