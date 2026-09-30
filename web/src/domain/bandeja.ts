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

/** Los botones que tiene la tarjeta según en qué pestaña está la oferta. */
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
      return [{ etiqueta: "Volver a Me interesa", destino: "me_interesa" }];
    case "descartada":
      return [{ etiqueta: "Recuperar", destino: "nueva" }];
    default:
      return [];
  }
}

/** Nivel del puntaje para darle color: alto (60+), medio (40-59) o bajo. */
export function nivelPuntaje(puntaje: number | null): "alto" | "medio" | "bajo" {
  if (puntaje === null) return "bajo";
  if (puntaje >= 60) return "alto";
  if (puntaje >= 40) return "medio";
  return "bajo";
}
