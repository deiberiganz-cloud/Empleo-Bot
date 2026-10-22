import fs from 'node:fs'
import path from 'node:path'
import { normalizarPerfil, nombreCvParaEnvio, PERFIL_VACIO, perfilATexto, perfilVacio } from '../services/perfil.js'

// Los tipos de foto que se aceptan, con la extensión con la que se guardan.
export const TIPOS_FOTO = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }

// SQLite guarda los booleanos como 0/1: los devolvemos como true/false.
const aCv = fila => fila && { ...fila, predeterminado: fila.predeterminado === 1 }

/**
 * El perfil del candidato (una sola fila) y sus archivos: la foto y los CV en PDF.
 * Los archivos viven en `carpeta` (data/perfil/, fuera del repo); la base guarda solo sus nombres.
 */
export class PerfilManager {
    /**
     * @param db la base (node:sqlite)
     * @param {string} carpeta dónde se guardan foto y CV
     */
    constructor(db, carpeta) {
        this.db = db
        this.carpeta = carpeta
    }

    #rutaDe(archivo) {
        return path.join(this.carpeta, archivo)
    }

    #escribir(archivo, contenido) {
        fs.mkdirSync(this.carpeta, { recursive: true })
        fs.writeFileSync(this.#rutaDe(archivo), contenido)
    }

    #borrarArchivo(archivo) {
        fs.rmSync(this.#rutaDe(archivo), { force: true })
    }

    #fila() {
        return this.db.prepare('SELECT * FROM perfil WHERE id = 1').get()
    }

    /** Los datos del perfil (vacíos si todavía no se cargó nada) y si tiene foto. */
    obtener() {
        const fila = this.#fila()
        return {
            datos: fila ? normalizarPerfil(JSON.parse(fila.datos)) : normalizarPerfil(PERFIL_VACIO),
            tieneFoto: Boolean(fila?.foto),
            actualizado: fila?.actualizado ?? null,
        }
    }

    /**
     * El perfil como texto para Claude (evaluar, cartas, postular). Lanza si todavía está vacío:
     * sin perfil, Claude no tiene con qué trabajar.
     */
    textoParaClaude() {
        const { datos } = this.obtener()
        if (perfilVacio(datos)) throw new Error('Tu perfil está vacío: complétalo en la pestaña Perfil')
        return perfilATexto(datos)
    }

    /** Guarda los datos (normalizados) y devuelve el perfil como queda. */
    guardar(datos, ahora = new Date()) {
        const limpios = JSON.stringify(normalizarPerfil(datos))
        this.db.prepare(`
            INSERT INTO perfil (id, datos, actualizado) VALUES (1, ?, ?)
            ON CONFLICT (id) DO UPDATE SET datos = excluded.datos, actualizado = excluded.actualizado
        `).run(limpios, ahora.toISOString())
        return this.obtener()
    }

    /**
     * Reemplaza la foto de perfil.
     * @param {Buffer} contenido
     * @param {string} tipo uno de TIPOS_FOTO
     */
    guardarFoto(contenido, tipo, ahora = new Date()) {
        const anterior = this.#fila()?.foto
        const archivo = `foto-${ahora.getTime()}.${TIPOS_FOTO[tipo]}`
        this.#escribir(archivo, contenido)
        if (!this.#fila()) this.guardar(PERFIL_VACIO, ahora)
        this.db.prepare('UPDATE perfil SET foto = ?, actualizado = ? WHERE id = 1').run(archivo, ahora.toISOString())
        if (anterior && anterior !== archivo) this.#borrarArchivo(anterior)
        return this.obtener()
    }

    /** Ruta absoluta de la foto, o null si no hay. */
    rutaFoto() {
        const foto = this.#fila()?.foto
        return foto ? this.#rutaDe(foto) : null
    }

    listarCvs() {
        return this.db.prepare('SELECT * FROM cvs ORDER BY predeterminado DESC, subido DESC, id DESC').all().map(aCv)
    }

    obtenerCv(id) {
        return aCv(this.db.prepare('SELECT * FROM cvs WHERE id = ?').get(id)) ?? null
    }

    /**
     * Guarda un CV nuevo. Si es el primero, queda como predeterminado.
     * @param {{ contenido: Buffer, nombreOriginal: string, nombre?: string }} cv
     */
    agregarCv({ contenido, nombreOriginal, nombre }, ahora = new Date()) {
        const archivo = `cv-${ahora.getTime()}.pdf`
        this.#escribir(archivo, contenido)
        const esElPrimero = this.db.prepare('SELECT COUNT(*) AS total FROM cvs').get().total === 0
        const { lastInsertRowid } = this.db.prepare(`
            INSERT INTO cvs (nombre, archivo, nombre_original, tamano, predeterminado, subido) VALUES (?, ?, ?, ?, ?, ?)
        `).run(nombre?.trim() || nombreOriginal.replace(/\.pdf$/i, ''), archivo, nombreOriginal, contenido.length, esElPrimero ? 1 : 0, ahora.toISOString())
        return this.obtenerCv(Number(lastInsertRowid))
    }

    /** Cambia el nombre que se muestra de un CV (ej. "CV Atención al cliente"). */
    renombrarCv(id, nombre) {
        this.db.prepare('UPDATE cvs SET nombre = ? WHERE id = ?').run(nombre.trim(), id)
        return this.obtenerCv(id)
    }

    /** Deja este CV como el único predeterminado (el que adjunta el postulador). */
    marcarPredeterminado(id) {
        if (!this.obtenerCv(id)) return null
        this.db.exec('BEGIN')
        try {
            this.db.prepare('UPDATE cvs SET predeterminado = CASE WHEN id = ? THEN 1 ELSE 0 END').run(id)
            this.db.exec('COMMIT')
        } catch (error) {
            this.db.exec('ROLLBACK')
            throw error
        }
        return this.obtenerCv(id)
    }

    /** Borra un CV (y su archivo). Si era el predeterminado, pasa a serlo el más nuevo que quede. */
    quitarCv(id) {
        const cv = this.obtenerCv(id)
        if (!cv) return false
        this.db.prepare('DELETE FROM cvs WHERE id = ?').run(id)
        this.#borrarArchivo(cv.archivo)
        if (cv.predeterminado) {
            const siguiente = this.db.prepare('SELECT id FROM cvs ORDER BY subido DESC, id DESC LIMIT 1').get()
            if (siguiente) this.marcarPredeterminado(siguiente.id)
        }
        return true
    }

    /** Ruta absoluta de un CV, o null si no existe. */
    rutaCv(id) {
        const cv = this.obtenerCv(id)
        return cv ? this.#rutaDe(cv.archivo) : null
    }

    /** Ruta absoluta del CV predeterminado (el que usa el postulador), o null si no hay ninguno. */
    rutaCvPredeterminado() {
        const fila = this.db.prepare('SELECT archivo FROM cvs WHERE predeterminado = 1').get()
        return fila ? this.#rutaDe(fila.archivo) : null
    }

    /**
     * Copia el CV predeterminado a data/perfil/envio/ con su nombre original (sin tocar el guardado) y
     * devuelve esa ruta: es la que se sube a los formularios, así el reclutador no ve "cv-1792512418469.pdf".
     * Vacía la carpeta antes, para que ahí quede un solo archivo. Devuelve null si no hay CV predeterminado.
     */
    rutaCvParaEnvio() {
        const fila = this.db.prepare('SELECT archivo, nombre_original FROM cvs WHERE predeterminado = 1').get()
        if (!fila) return null
        const carpetaEnvio = path.join(this.carpeta, 'envio')
        fs.rmSync(carpetaEnvio, { recursive: true, force: true })
        fs.mkdirSync(carpetaEnvio, { recursive: true })
        const destino = path.join(carpetaEnvio, nombreCvParaEnvio(fila.nombre_original))
        fs.copyFileSync(this.#rutaDe(fila.archivo), destino)
        return destino
    }
}
