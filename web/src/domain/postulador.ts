import type { EstadoPostulador, Oferta } from "./types";

/** Cómo se ve una oferta de "Por postular" según el postulador. */
export type EstadoPostulacion = "en_curso" | "en_fila" | "bloqueada";

/**
 * En qué punto está una oferta de "Por postular": la que Claude está postulando ahora, bloqueada
 * (con motivo, se puede reintentar) o esperando su turno. Fuera de "Por postular" no aplica (null).
 */
export function estadoPostulacion(oferta: Oferta, postulador: EstadoPostulador | undefined): EstadoPostulacion | null {
  if (oferta.estado !== "por_postular") return null;
  if (oferta.bloqueada_motivo) return "bloqueada";
  if (postulador?.enCurso?.id === oferta.id) return "en_curso";
  return "en_fila";
}

/** ¿El postulador está ocupado o tiene ofertas esperando? Si sí, la pantalla se actualiza más seguido. */
export function postuladorActivo(postulador: EstadoPostulador | undefined): boolean {
  return !!postulador && (postulador.enCurso !== null || postulador.enFila > 0);
}

/** "Hoy: 3 de 10 intentos" (para el título de la columna). */
export function textoIntentos(postulador: EstadoPostulador): string {
  return `Hoy: ${postulador.intentosHoy} de ${postulador.limite} intentos`;
}
