import { ESTADOS, ESTADOS_CERRADOS } from '../config/db.js'

const DIA = 24 * 60 * 60 * 1000
export const DIAS_PARA_ARCHIVAR = 7
export const DIAS_EN_ARCHIVO = 30
const DIAS_CORREOS_PROCESADOS = 60
// Un aviso publicado hace más de esto ya no vale la pena: los portales los cierran rápido
// (el mismo límite que el prefiltro de busqueda/normalizar.js).
export const DIAS_AVISO_VIEJO = 5

const haceDias = (ahora, dias) => new Date(ahora.getTime() - dias * DIA).toISOString()

/** La fecha local como "AAAA-MM-DD" (el límite diario se cuenta por día de la compu, no por UTC). */
export const diaLocal = fecha =>
    `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}-${String(fecha.getDate()).padStart(2, '0')}`

// SQLite guarda los booleanos como 0/1: los devolvemos como true/false.
const aOferta = fila => fila && { ...fila, postular: fila.postular === 1, estafa: fila.estafa === 1 }

export class OfertasManager {
    constructor(db) {
        this.db = db
    }

    /**
     * Lista ofertas, las más nuevas y mejor puntuadas primero. Los filtros son opcionales.
     * Por defecto deja afuera las archivadas; con `archivadas: true` devuelve solo esas.
     * @param {{ estado?: string, tipo?: string, archivadas?: boolean }} filtro
     */
    listar(filtro = {}) {
        const condiciones = [filtro.archivadas ? 'archivada IS NOT NULL' : 'archivada IS NULL']
        const valores = []
        if (filtro.estado) {
            condiciones.push('estado = ?')
            valores.push(filtro.estado)
        }
        if (filtro.tipo) {
            condiciones.push('tipo = ?')
            valores.push(filtro.tipo)
        }
        const donde = `WHERE ${condiciones.join(' AND ')}`
        const filas = this.db
            .prepare(`SELECT * FROM ofertas ${donde} ORDER BY encontrada DESC, puntaje DESC, id DESC`)
            .all(...valores)
        return filas.map(aOferta)
    }

    /**
     * Todas las url ya vistas (guardadas o borradas), para no volver a evaluarlas.
     * @returns {Set<string>}
     */
    urlsGuardadas() {
        return new Set(this.db.prepare('SELECT url FROM ofertas UNION SELECT url FROM ofertas_borradas').all().map(fila => fila.url))
    }

    obtenerPorUrl(url) {
        return aOferta(this.db.prepare('SELECT * FROM ofertas WHERE url = ?').get(url)) ?? null
    }

    /**
     * Ofertas que esperan respuesta de una empresa (para buscar sus correos).
     */
    enProceso() {
        return this.db.prepare(`SELECT * FROM ofertas WHERE estado IN ('postulada', 'entrevista', 'oferta')`).all().map(aOferta)
    }

    obtenerPorId(id) {
        return aOferta(this.db.prepare('SELECT * FROM ofertas WHERE id = ?').get(id)) ?? null
    }

    /**
     * Cambia el estado de una oferta y guarda cuándo cambió.
     * @returns la oferta actualizada, o null si no existe
     */
    cambiarEstado(id, estado, ahora = new Date().toISOString()) {
        if (!ESTADOS.includes(estado)) throw new Error(`Estado inválido: ${estado}`)
        // La primera vez que pasa a "postulada" se anota la fecha de postulación (para el
        // recordatorio de 7 días y el resumen). Si después vuelve atrás y adelante, no se pisa.
        // Si estaba archivada y se le cambia el estado, vuelve a estar activa. Y cualquier cambio de
        // estado levanta el bloqueo del postulador (si vuelve a "por_postular", se reintenta).
        const resultado = this.db.prepare(`
            UPDATE ofertas
            SET estado = ?, estado_actualizado = ?, archivada = NULL, bloqueada_motivo = NULL,
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
     * Guarda el mensaje corto para el reclutador (la versión corta de la carta, para LinkedIn).
     * @returns la oferta actualizada, o null si no existe
     */
    guardarMensajeCorto(id, mensaje) {
        return this.#actualizarCampo(id, 'mensaje_corto', mensaje)
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

    /**
     * Agrega una línea al final de las notas (las del seguimiento automático), sin borrar lo que había.
     * @returns la oferta actualizada, o null si no existe
     */
    agregarNota(id, linea) {
        const resultado = this.db.prepare(`
            UPDATE ofertas SET notas = CASE WHEN notas IS NULL OR notas = '' THEN ? ELSE notas || char(10) || ? END
            WHERE id = ?
        `).run(linea, linea, id)
        if (resultado.changes === 0) return null
        return this.obtenerPorId(id)
    }

    /**
     * La próxima oferta que le toca al postulador: la que lleva más tiempo en "por_postular"
     * y no está bloqueada. null si no hay ninguna.
     */
    siguienteParaPostular() {
        return aOferta(this.db.prepare(`
            SELECT * FROM ofertas
            WHERE estado = 'por_postular' AND bloqueada_motivo IS NULL AND archivada IS NULL
            ORDER BY COALESCE(estado_actualizado, encontrada), id LIMIT 1
        `).get()) ?? null
    }

    /** Cuántas ofertas esperan al postulador en la fila (en "por_postular" y sin bloquear). */
    contarEnFila() {
        return this.db.prepare(`
            SELECT COUNT(*) AS cantidad FROM ofertas
            WHERE estado = 'por_postular' AND bloqueada_motivo IS NULL AND archivada IS NULL
        `).get().cantidad
    }

    /**
     * Marca una oferta como bloqueada: el postulador no pudo seguir y dejó el motivo.
     * Sigue en "por_postular" pero sale de la fila hasta que se la reintente.
     * @returns la oferta actualizada, o null si no existe
     */
    bloquear(id, motivo) {
        return this.#actualizarCampo(id, 'bloqueada_motivo', motivo)
    }

    /**
     * Levanta el bloqueo para que el postulador la vuelva a intentar.
     * @returns la oferta actualizada, o null si no existe
     */
    desbloquear(id) {
        return this.#actualizarCampo(id, 'bloqueada_motivo', null)
    }

    /**
     * Anota un intento del postulador (aunque no haya postulado): cuenta para el límite del día.
     * @param {{ ofertaId: number, resultado: string, nota?: string, duracionMs?: number }} intento
     */
    registrarIntento({ ofertaId, resultado, nota = null, duracionMs = null }, ahora = new Date()) {
        this.db.prepare(`
            INSERT INTO postulaciones_intentos (oferta_id, fecha, dia, resultado, nota, duracion_ms)
            VALUES (?, ?, ?, ?, ?, ?)
        `).run(ofertaId, ahora.toISOString(), diaLocal(ahora), resultado, nota, duracionMs)
    }

    /** Cuántos intentos de postulación hubo en el día local de `ahora`. */
    intentosDelDia(ahora = new Date()) {
        return this.db.prepare('SELECT COUNT(*) AS cantidad FROM postulaciones_intentos WHERE dia = ?').get(diaLocal(ahora)).cantidad
    }

    yaProcesado(messageId) {
        return !!this.db.prepare('SELECT 1 FROM correos_procesados WHERE message_id = ?').get(messageId)
    }

    marcarProcesado(messageId, ahora = new Date().toISOString()) {
        this.db.prepare('INSERT OR IGNORE INTO correos_procesados (message_id, procesado) VALUES (?, ?)').run(messageId, ahora)
    }

    /**
     * Suma un intento fallido a un correo (Claude no pudo clasificarlo).
     * @returns {number} cuántas veces falló en total
     */
    sumarIntentoFallido(messageId, ahora = new Date().toISOString()) {
        return this.db.prepare(`
            INSERT INTO correos_fallidos (message_id, intentos, ultimo) VALUES (?, 1, ?)
            ON CONFLICT (message_id) DO UPDATE SET intentos = intentos + 1, ultimo = excluded.ultimo
            RETURNING intentos
        `).get(messageId, ahora).intentos
    }

    /**
     * Anota una búsqueda terminada (la llama evaluar.js al final de cada búsqueda).
     * @param {{ recibidas: number, nuevas: number, buenas: number, errores?: string[] }} busqueda
     */
    registrarBusqueda({ recibidas, nuevas, buenas, errores = [] }, ahora = new Date().toISOString()) {
        this.db.prepare('INSERT INTO busquedas (fecha, recibidas, nuevas, buenas, errores) VALUES (?, ?, ?, ?, ?)')
            .run(ahora, recibidas, nuevas, buenas, JSON.stringify(errores))
    }

    /**
     * La búsqueda más reciente, o null si nunca se buscó.
     * @returns {{ fecha: string, recibidas: number, nuevas: number, buenas: number, errores: string[] } | null}
     */
    ultimaBusqueda() {
        const fila = this.db.prepare('SELECT fecha, recibidas, nuevas, buenas, errores FROM busquedas ORDER BY fecha DESC, id DESC LIMIT 1').get()
        return fila ? { ...fila, errores: JSON.parse(fila.errores) } : null
    }

    /**
     * Mantenimiento diario:
     * 0. Archiva las "nuevas" sin tocar cuyo aviso se publicó hace más de DIAS_AVISO_VIEJO días
     *    (o, si no tiene fecha, que se encontró hace más de eso), con una nota 🤖. Las que marcaste
     *    o en las que te postulaste no se tocan.
     * 1. Archiva las ofertas cerradas (descartada, rechazada, oferta) hace DIAS_PARA_ARCHIVAR días.
     * 2. Borra las archivadas hace DIAS_EN_ARCHIVO días, dejando en ofertas_borradas su url
     *    (para no volver a evaluarlas) y cómo terminaron.
     * 3. Olvida los correos procesados (y los fallidos) viejos.
     * @returns {{ viejas: number, archivadas: number, borradas: number }}
     */
    limpiar(ahora = new Date()) {
        const iso = ahora.toISOString()
        const limite = haceDias(ahora, DIAS_AVISO_VIEJO).slice(0, 10)
        const nota = `🤖 ${iso.slice(8, 10)}/${iso.slice(5, 7)}: archivada sola, el aviso tiene más de ${DIAS_AVISO_VIEJO} días.`
        const viejas = this.db.prepare(`
            UPDATE ofertas SET archivada = ?,
                notas = CASE WHEN notas IS NULL OR notas = '' THEN ? ELSE notas || char(10) || ? END
            WHERE estado = 'nueva' AND archivada IS NULL
              AND CASE WHEN fecha_publicacion GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]*'
                       THEN substr(fecha_publicacion, 1, 10) ELSE substr(encontrada, 1, 10) END < ?
        `).run(iso, nota, nota, limite).changes

        const cerrados = ESTADOS_CERRADOS.map(() => '?').join(', ')
        const archivadas = this.db.prepare(`
            UPDATE ofertas SET archivada = ?
            WHERE archivada IS NULL AND estado IN (${cerrados}) AND COALESCE(estado_actualizado, encontrada) <= ?
        `).run(iso, ...ESTADOS_CERRADOS, haceDias(ahora, DIAS_PARA_ARCHIVAR)).changes

        const paraBorrar = 'archivada <= ?'
        const limites = [haceDias(ahora, DIAS_EN_ARCHIVO)]
        let borradas = 0
        this.db.exec('BEGIN')
        try {
            this.db.prepare(`
                INSERT OR REPLACE INTO ofertas_borradas (url, titulo, empresa, estado_final, fecha_postulacion, borrada)
                SELECT url, titulo, empresa, estado, fecha_postulacion, ? FROM ofertas WHERE ${paraBorrar}
            `).run(iso, ...limites)
            borradas = this.db.prepare(`DELETE FROM ofertas WHERE ${paraBorrar}`).run(...limites).changes
            this.db.prepare('DELETE FROM correos_procesados WHERE procesado <= ?').run(haceDias(ahora, DIAS_CORREOS_PROCESADOS))
            this.db.prepare('DELETE FROM correos_fallidos WHERE ultimo <= ?').run(haceDias(ahora, DIAS_CORREOS_PROCESADOS))
            this.db.exec('COMMIT')
        } catch (error) {
            this.db.exec('ROLLBACK')
            throw error
        }
        return { viejas, archivadas, borradas }
    }

    /**
     * Totales de toda la historia (activas + borradas), para ver cómo viene la búsqueda.
     * No cuenta las "nuevas": solo las que se llegaron a mover.
     */
    historial() {
        const filas = this.db.prepare(`
            SELECT estado, COUNT(*) AS cantidad FROM (
                SELECT estado FROM ofertas
                UNION ALL SELECT estado_final FROM ofertas_borradas
            ) WHERE estado != 'nueva' GROUP BY estado
        `).all()
        const { cantidad: postuladas } = this.db.prepare(`
            SELECT (SELECT COUNT(*) FROM ofertas WHERE fecha_postulacion IS NOT NULL)
                 + (SELECT COUNT(*) FROM ofertas_borradas WHERE fecha_postulacion IS NOT NULL) AS cantidad
        `).get()
        return { postuladas, porEstado: Object.fromEntries(filas.map(fila => [fila.estado, fila.cantidad])) }
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
