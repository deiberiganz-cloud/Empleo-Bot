import { ESTADOS } from '../config/db.js'

// SQLite guarda los booleanos como 0/1: los devolvemos como true/false.
const aOferta = fila => fila && { ...fila, postular: fila.postular === 1, estafa: fila.estafa === 1 }

export class OfertasManager {
    constructor(db) {
        this.db = db
    }

    /**
     * Lista ofertas, las más nuevas y mejor puntuadas primero. Los filtros son opcionales.
     * @param {{ estado?: string, tipo?: string }} filtro
     */
    listar(filtro = {}) {
        const condiciones = []
        const valores = []
        if (filtro.estado) {
            condiciones.push('estado = ?')
            valores.push(filtro.estado)
        }
        if (filtro.tipo) {
            condiciones.push('tipo = ?')
            valores.push(filtro.tipo)
        }
        const donde = condiciones.length ? `WHERE ${condiciones.join(' AND ')}` : ''
        const filas = this.db
            .prepare(`SELECT * FROM ofertas ${donde} ORDER BY encontrada DESC, puntaje DESC, id DESC`)
            .all(...valores)
        return filas.map(aOferta)
    }

    /**
     * Todas las url guardadas, para saber qué ofertas ya se evaluaron.
     * @returns {Set<string>}
     */
    urlsGuardadas() {
        return new Set(this.db.prepare('SELECT url FROM ofertas').all().map(fila => fila.url))
    }

    obtenerPorId(id) {
        return aOferta(this.db.prepare('SELECT * FROM ofertas WHERE id = ?').get(id)) ?? null
    }

    /**
     * Cambia el estado de una oferta y guarda cuándo cambió.
     * @returns la oferta actualizada, o null si no existe
     */
    cambiarEstado(id, estado) {
        if (!ESTADOS.includes(estado)) throw new Error(`Estado inválido: ${estado}`)
        const ahora = new Date().toISOString()
        // La primera vez que pasa a "postulada" se anota la fecha de postulación (para el
        // recordatorio de 7 días y el resumen). Si después vuelve atrás y adelante, no se pisa.
        const resultado = this.db.prepare(`
            UPDATE ofertas
            SET estado = ?, estado_actualizado = ?,
                fecha_postulacion = CASE WHEN ? = 'postulada' THEN COALESCE(fecha_postulacion, ?) ELSE fecha_postulacion END
            WHERE id = ?
        `).run(estado, ahora, estado, ahora, id)
        if (resultado.changes === 0) return null
        return this.obtenerPorId(id)
    }

    /**
     * Guarda la carta de presentación de una oferta (la que escribió Claude o la editada).
     * @returns la oferta actualizada, o null si no existe
     */
    guardarCarta(id, carta) {
        return this.#actualizarCampo(id, 'carta', carta)
    }

    /**
     * Guarda las notas propias sobre una oferta.
     * @returns la oferta actualizada, o null si no existe
     */
    guardarNotas(id, notas) {
        return this.#actualizarCampo(id, 'notas', notas)
    }

    /**
     * Guarda la fecha y hora de la entrevista (texto ISO), o null para borrarla.
     * @returns la oferta actualizada, o null si no existe
     */
    guardarEntrevista(id, fecha) {
        return this.#actualizarCampo(id, 'fecha_entrevista', fecha)
    }

    /**
     * Guarda el mensaje de seguimiento que escribió Claude.
     * @returns la oferta actualizada, o null si no existe
     */
    guardarSeguimiento(id, mensaje) {
        return this.#actualizarCampo(id, 'mensaje_seguimiento', mensaje)
    }

    // Solo se llama con nombres de columna fijos de esta clase, nunca con texto del usuario.
    #actualizarCampo(id, columna, valor) {
        const resultado = this.db.prepare(`UPDATE ofertas SET ${columna} = ? WHERE id = ?`).run(valor, id)
        if (resultado.changes === 0) return null
        return this.obtenerPorId(id)
    }

    /**
     * Guarda una oferta nueva. Si la url ya existe no hace nada (no pisa el estado ni las notas).
     * @returns true si la guardó, false si ya estaba
     */
    guardar(oferta) {
        const resultado = this.db.prepare(`
            INSERT INTO ofertas (url, titulo, empresa, fuente, ubicacion, descripcion, fecha_publicacion,
                                 encontrada, puntaje, tipo, motivo, postular, estafa)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT (url) DO NOTHING
        `).run(
            oferta.url, oferta.titulo, oferta.empresa ?? null, oferta.fuente ?? null, oferta.ubicacion ?? null,
            oferta.descripcion ?? null, oferta.fecha ?? null, oferta.encontrada,
            oferta.puntaje ?? null, oferta.tipo ?? null, oferta.motivo ?? null,
            oferta.postular ? 1 : 0, oferta.estafa ? 1 : 0,
        )
        return resultado.changes === 1
    }
}
