import { useCallback, useState } from "react";
import type { Oferta } from "../domain/types";

/**
 * Qué oferta está abierta en el panel de detalle. La busca en la lista completa:
 * si la oferta cambia de pestaña o de columna, el panel sigue abierto y actualizado.
 *
 * @returns `ofertaAbierta` (o null), `abrirOferta(id)` y `cerrarOferta()`.
 * @example
 * const { ofertaAbierta, abrirOferta, cerrarOferta } = useOfertaAbierta(ofertas);
 */
export function useOfertaAbierta(ofertas: Oferta[]) {
  const [idAbierta, setIdAbierta] = useState<number | null>(null);
  const cerrarOferta = useCallback(() => setIdAbierta(null), []);
  return {
    ofertaAbierta: ofertas.find((oferta) => oferta.id === idAbierta) ?? null,
    abrirOferta: setIdAbierta,
    cerrarOferta,
  };
}
