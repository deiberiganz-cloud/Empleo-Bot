import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { guardarNotasOferta } from "../api/ofertasApi";
import type { Oferta } from "../domain/types";
import { useActualizarOfertaEnCache } from "./useActualizarOfertaEnCache";

/**
 * Notas propias de una oferta. Se guardan solas al salir del cuadro (onBlur), solo si cambiaron.
 *
 * @returns el texto, su setter, `guardarSiCambio` para el onBlur y el estado del guardado.
 * @example
 * const notas = useNotas(oferta);
 * <textarea value={notas.texto} onChange={(e) => notas.setTexto(e.target.value)} onBlur={notas.guardarSiCambio} />
 */
export function useNotas(oferta: Oferta) {
  const [texto, setTexto] = useState(oferta.notas ?? "");
  const actualizarEnCache = useActualizarOfertaEnCache();

  const guardado = useMutation({
    mutationFn: (notas: string) => guardarNotasOferta(oferta.id, notas),
    onSuccess: actualizarEnCache,
  });

  const guardarSiCambio = () => {
    if (texto === (oferta.notas ?? "")) return;
    guardado.mutate(texto);
  };

  return {
    texto,
    setTexto,
    guardarSiCambio,
    guardando: guardado.isPending,
    guardadoOk: guardado.isSuccess && texto === (oferta.notas ?? ""),
    error: guardado.error?.message ?? null,
  };
}
