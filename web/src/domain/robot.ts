import type { Oferta } from "./types";

/**
 * Las poses del robot: cuadros del modelo 3D renderizados en Blender (archivos en web/public/robot/,
 * generados con blender/animar-robot.py y blender/sprites-a-webp.py).
 */
export const POSES = [
  "parado",
  "parado-caja",
  ...cuadros("caminar", 8),
  ...cuadros("caja", 8),
  ...cuadros("trabajar", 4),
  "salto",
  "preocupado",
] as const;

type Cuadro<N extends string> = `${N}-${number}`;
export type Pose = "parado" | "parado-caja" | "salto" | "preocupado" | Cuadro<"caminar" | "caja" | "trabajar">;

function cuadros<N extends string>(nombre: N, cantidad: number): Cuadro<N>[] {
  return Array.from({ length: cantidad }, (_, i) => `${nombre}-${i}` as Cuadro<N>);
}

/** Las secuencias que se repiten: caminar con las manos vacías, con la caja y trabajar con la tablet. */
export const CAMINAR: Pose[] = cuadros("caminar", 8);
export const CAMINAR_CAJA: Pose[] = cuadros("caja", 8);
export const TRABAJAR: Pose[] = cuadros("trabajar", 4);

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
