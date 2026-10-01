import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { guardarEntrevistaOferta } from "../api/ofertasApi";
import type { Oferta } from "../domain/types";
import { useActualizarOfertaEnCache } from "./useActualizarOfertaEnCache";

/**
 * Fecha y hora de la entrevista de una oferta. Se guarda sola al elegirla (o al borrarla).
 * El valor tiene el formato del input datetime-local: "2026-10-06T15:00".
 *
 * @returns el valor del input, `cambiar(valor)` y el estado del guardado.
 * @example
 * const entrevista = useEntrevista(oferta);
 * <input type="datetime-local" value={entrevista.valor} onChange={(e) => entrevista.cambiar(e.target.value)} />
 */
export function useEntrevista(oferta: Oferta) {
  const [valor, setValor] = useState(oferta.fecha_entrevista?.slice(0, 16) ?? "");
  const actualizarEnCache = useActualizarOfertaEnCache();

  const guardado = useMutation({
    mutationFn: (fecha: string | null) => guardarEntrevistaOferta(oferta.id, fecha),
    onSuccess: actualizarEnCache,
  });

  const cambiar = (nuevo: string) => {
    setValor(nuevo);
    guardado.mutate(nuevo || null);
  };

  return {
    valor,
    cambiar,
    guardando: guardado.isPending,
    guardadoOk: guardado.isSuccess,
    error: guardado.error?.message ?? null,
  };
}
