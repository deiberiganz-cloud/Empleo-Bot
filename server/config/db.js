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
        notas              TEXT,
        carta              TEXT,
        fecha_postulacion  TEXT,
        fecha_entrevista   TEXT,
        mensaje_seguimiento TEXT,
        archivada          TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_ofertas_estado ON ofertas (estado);

    -- Lo que queda de una oferta borrada: su url (para no volver a evaluarla) y cómo terminó.
    CREATE TABLE IF NOT EXISTS ofertas_borradas (
        url               TEXT PRIMARY KEY,
        titulo            TEXT,
        empresa           TEXT,
        estado_final      TEXT NOT NULL,
        fecha_postulacion TEXT,
        borrada           TEXT NOT NULL
    );

    -- Correos de Gmail que el seguimiento automático ya leyó, para no procesarlos dos veces.
    CREATE TABLE IF NOT EXISTS correos_procesados (
        message_id TEXT PRIMARY KEY,
        procesado  TEXT NOT NULL
    );
`

// Estados en los que una oferta ya terminó: a los DIAS_PARA_ARCHIVAR pasan al Archivo.
export const ESTADOS_CERRADOS = ['descartada', 'rechazada', 'oferta']

// Columnas que se agregaron después de crear la tabla. Si la base es vieja, se suman
// con ALTER TABLE sin perder los datos (una "migración" chica y a mano).
const COLUMNAS_AGREGADAS = [
    { nombre: 'carta', tipo: 'TEXT' },
    { nombre: 'fecha_postulacion', tipo: 'TEXT' },
    { nombre: 'fecha_entrevista', tipo: 'TEXT' },
    { nombre: 'mensaje_seguimiento', tipo: 'TEXT' },
    { nombre: 'archivada', tipo: 'TEXT' },
]

const migrar = db => {
    const existentes = new Set(db.prepare('PRAGMA table_info(ofertas)').all().map(columna => columna.name))
    for (const columna of COLUMNAS_AGREGADAS) {
        if (!existentes.has(columna.nombre)) db.exec(`ALTER TABLE ofertas ADD COLUMN ${columna.nombre} ${columna.tipo}`)
    }
    // Las que ya estaban postuladas antes de existir fecha_postulacion: usamos la fecha del último cambio.
    db.exec(`
        UPDATE ofertas SET fecha_postulacion = estado_actualizado
        WHERE fecha_postulacion IS NULL AND estado IN ('postulada', 'entrevista', 'oferta', 'rechazada')
    `)
}

/**
 * Abre la base SQLite y crea las tablas si no existen.
 * @param {string} ruta Ruta del archivo, o ':memory:' para los tests.
 * @returns {DatabaseSync}
 */
export const conectarDB = (ruta = process.env.DB_PATH || RUTA_DB_POR_DEFECTO) => {
    const db = new DatabaseSync(ruta)
    db.exec('PRAGMA journal_mode = WAL;')
    db.exec(ESQUEMA)
    migrar(db)
    return db
}
