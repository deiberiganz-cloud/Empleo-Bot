import type { Oferta } from "./types";

/** Las poses del robot (archivos en web/public/robot/, recortados con docs/recortar-robot.py). */
export const POSES = [
  "parado",
  "paso-a",
  "paso-b",
  "caja-paso-0",
  "caja-paso-1",
  "caja-paso-2",
  "tablet",
  "tablet-concentrado",
  "parado-caja",
  "salto",
  "preocupado",
] as const;

export type Pose = (typeof POSES)[number];

/** Las secuencias que se repiten: caminar con las manos vacías, con la caja y trabajar con la tablet. */
export const CAMINAR: Pose[] = ["paso-a", "parado", "paso-b", "parado"];
export const CAMINAR_CAJA: Pose[] = ["caja-paso-0", "caja-paso-2", "caja-paso-1", "caja-paso-2"];
export const TRABAJAR: Pose[] = ["tablet", "tablet-concentrado"];

/** Cómo termina la escena: entrega la caja y salta, se preocupa con el "!", o vuelve con la caja. */
export type FinalRobot = "postulada" | "bloqueada" | "devuelta";

const YA_POSTULADA: Oferta["estado"][] = ["postulada", "entrevista", "oferta", "rechazada"];

/**
 * Cómo terminó una postulación, mirando la oferta después de que el postulador la soltó.
 * Si sigue en "Por postular" sin bloqueo (por ejemplo, se reinició la app), el robot la devuelve a la fila.
 */
export function finalDePostulacion(oferta: Pick<Oferta, "estado" | "bloqueada_motivo"> | null): FinalRobot {
  if (!oferta) return "devuelta";
  if (YA_POSTULADA.includes(oferta.estado)) return "postulada";
  if (oferta.estado === "por_postular" && oferta.bloqueada_motivo) return "bloqueada";
  return "devuelta";
}

/** El globito sobre el robot: "Postulando a JBK Argentina… 4 min". */
export function textoGlobo(empresa: string | null, desde: string, ahora: Date): string {
  const minutos = Math.max(0, Math.floor((ahora.getTime() - new Date(desde).getTime()) / 60000));
  return `Postulando a ${empresa || "la oferta"}… ${minutos} min`;
}
