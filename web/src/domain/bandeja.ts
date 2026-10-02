import type { Accion, Estado, FiltroBandeja, Oferta } from "./types";

/** Una oferta es "recomendada" si Claude dijo que conviene postular y no parece estafa. */
export function esRecomendada(oferta: Oferta): boolean {
  return oferta.postular && !oferta.estafa;
}

/**
 * Aplica los filtros de la Bandeja. "Solo recomendadas" se aplica solo en "Nuevas":
 * lo que ya marcaste (me interesa, postulada, descartada) se ve siempre.
 */
export function filtrarOfertas(ofertas: Oferta[], filtro: FiltroBandeja): Oferta[] {
  return ofertas.filter((oferta) => {
    if (oferta.estado !== filtro.estado) return false;
    if (filtro.tipo && oferta.tipo !== filtro.tipo) return false;
    if (filtro.estado === "nueva" && filtro.soloRecomendadas && !esRecomendada(oferta)) return false;
    return true;
  });
}

/** Cuántas ofertas hay en cada estado (para los números de las pestañas). */
export function contarPorEstado(ofertas: Oferta[]): Record<Estado, number> {
  const conteo: Record<Estado, number> = {
    nueva: 0,
    me_interesa: 0,
    descartada: 0,
    postulada: 0,
    entrevista: 0,
    oferta: 0,
    rechazada: 0,
  };
  for (const oferta of ofertas) conteo[oferta.estado]++;
  return conteo;
}

/**
 * Los botones que tiene una oferta según su estado. Es la única fuente: la usan la Bandeja,
 * el tablero de Seguimiento y el panel de detalle. El botón "principal" es el paso siguiente natural.
 */
export function accionesPara(estado: Estado): Accion[] {
  switch (estado) {
    case "nueva":
      return [
        { etiqueta: "Descartar", destino: "descartada" },
        { etiqueta: "Me interesa", destino: "me_interesa", principal: true },
        { etiqueta: "Postulé", destino: "postulada" },
      ];
    case "me_interesa":
      return [
        { etiqueta: "Descartar", destino: "descartada" },
        { etiqueta: "Postulé", destino: "postulada", principal: true },
      ];
    case "postulada":
      return [
        { etiqueta: "← Me interesa", destino: "me_interesa" },
        { etiqueta: "✖ Rechazo", destino: "rechazada" },
        { etiqueta: "Entrevista →", destino: "entrevista", principal: true },
      ];
    case "entrevista":
      return [
        { etiqueta: "← Postulé", destino: "postulada" },
        { etiqueta: "✖ Rechazo", destino: "rechazada" },
        { etiqueta: "✔ Oferta", destino: "oferta", principal: true },
      ];
    case "oferta":
      return [{ etiqueta: "← Entrevista", destino: "entrevista" }];
    case "rechazada":
      return [{ etiqueta: "↩ Volver a Postulé", destino: "postulada" }];
    case "descartada":
      return [{ etiqueta: "Recuperar", destino: "nueva" }];
  }
}

/** Nivel del puntaje para darle color: alto (60+), medio (40-59) o bajo. */
export function nivelPuntaje(puntaje: number | null): "alto" | "medio" | "bajo" {
  if (puntaje === null) return "bajo";
  if (puntaje >= 60) return "alto";
  if (puntaje >= 40) return "medio";
  return "bajo";
}

/** A partir de cuántos días un aviso ya no es "fresco" (se marca en la tarjeta). Los de más de 30 ni llegan. */
export const DIAS_AVISO_FRESCO = 14;

/**
 * Cuánto hace que se publicó el aviso: "Publicada hoy", "Publicada ayer" o "Publicada hace 5 días".
 * La fecha viene como "AAAA-MM-DD" y se compara con el día de hoy en hora local.
 *
 * @returns el texto y si ya no es fresco, o null si no hay una fecha válida.
 * @example antiguedadAviso("2026-09-30", new Date(2026, 9, 2)) // { texto: "Publicada hace 2 días", vieja: false }
 */
export function antiguedadAviso(fecha: string | null, ahora = new Date()): { texto: string; vieja: boolean } | null {
  const partes = fecha?.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!partes) return null;
  const publicada = new Date(Number(partes[1]), Number(partes[2]) - 1, Number(partes[3]));
  const hoy = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate());
  const dias = Math.max(0, Math.round((hoy.getTime() - publicada.getTime()) / 86400000));
  const texto = dias === 0 ? "Publicada hoy" : dias === 1 ? "Publicada ayer" : `Publicada hace ${dias} días`;
  return { texto, vieja: dias > DIAS_AVISO_FRESCO };
}
