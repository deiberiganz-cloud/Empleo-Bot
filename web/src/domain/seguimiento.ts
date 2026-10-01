import type { Estado, Oferta } from "./types";

/** Días sin novedades después de postularse para sugerir un mensaje de seguimiento. */
export const DIAS_PARA_SEGUIMIENTO = 7;

const UN_DIA_MS = 24 * 60 * 60 * 1000;

/** Columnas del tablero de Seguimiento, de izquierda a derecha. */
export const COLUMNAS: { id: string; titulo: string; estados: Estado[] }[] = [
  { id: "me_interesa", titulo: "Me interesa", estados: ["me_interesa"] },
  { id: "postulada", titulo: "Postulé", estados: ["postulada"] },
  { id: "entrevista", titulo: "Entrevista", estados: ["entrevista"] },
  { id: "resultado", titulo: "Resultado", estados: ["oferta", "rechazada"] },
];

/** Días enteros que pasaron desde una fecha ISO hasta `hoy` (0 si es hoy o no hay fecha). */
export function diasDesde(fechaIso: string | null, hoy: Date = new Date()): number {
  if (!fechaIso) return 0;
  const diferencia = hoy.getTime() - new Date(fechaIso).getTime();
  return Math.max(0, Math.floor(diferencia / UN_DIA_MS));
}

/** Una postulación necesita seguimiento si sigue en "Postulé" hace 7 días o más. */
export function necesitaSeguimiento(oferta: Oferta, hoy: Date = new Date()): boolean {
  return oferta.estado === "postulada" && diasDesde(oferta.fecha_postulacion, hoy) >= DIAS_PARA_SEGUIMIENTO;
}

export interface ResumenSeguimiento {
  postulacionesSemana: number;
  entrevistas: number;
  postuladas: number;
  respondidas: number;
  /** Porcentaje (0 a 100) de postulaciones que tuvieron respuesta, o null si todavía no hay postulaciones. */
  tasaRespuesta: number | null;
}

const RESPONDIDAS: Estado[] = ["entrevista", "oferta", "rechazada"];

/** Los números de arriba del tablero. */
export function resumirSeguimiento(ofertas: Oferta[], hoy: Date = new Date()): ResumenSeguimiento {
  const postuladas = ofertas.filter((oferta) => oferta.fecha_postulacion);
  const respondidas = postuladas.filter((oferta) => RESPONDIDAS.includes(oferta.estado));
  return {
    postulacionesSemana: postuladas.filter((oferta) => diasDesde(oferta.fecha_postulacion, hoy) < 7).length,
    entrevistas: ofertas.filter((oferta) => oferta.estado === "entrevista" || oferta.estado === "oferta" || oferta.fecha_entrevista)
      .length,
    postuladas: postuladas.length,
    respondidas: respondidas.length,
    tasaRespuesta: postuladas.length ? Math.round((respondidas.length / postuladas.length) * 100) : null,
  };
}

/** "2026-10-06T15:00" → "lun 6/10, 15:00". */
export function formatearEntrevista(fechaIso: string): string {
  const fecha = new Date(fechaIso);
  if (Number.isNaN(fecha.getTime())) return fechaIso;
  const dia = fecha.toLocaleDateString("es-AR", { weekday: "short", day: "numeric", month: "numeric" });
  const hora = fecha.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" });
  return `${dia}, ${hora}`;
}

/** "Postulaste hoy" / "Postulaste hace 1 día" / "Postulaste hace 8 días". */
export function textoDiasPostulado(oferta: Oferta, hoy: Date = new Date()): string | null {
  if (!oferta.fecha_postulacion) return null;
  const dias = diasDesde(oferta.fecha_postulacion, hoy);
  if (dias === 0) return "Postulaste hoy";
  return `Postulaste hace ${dias} ${dias === 1 ? "día" : "días"}`;
}
