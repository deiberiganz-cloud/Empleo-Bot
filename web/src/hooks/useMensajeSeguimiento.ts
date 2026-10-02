import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { escribirSeguimientoOferta } from "../api/ofertasApi";
import type { Oferta } from "../domain/types";
import { useActualizarOfertaEnCache } from "./useActualizarOfertaEnCache";
import { copiarTexto } from "../utils/copiarTexto";

/**
 * Mensaje de seguimiento de una postulación: Claude lo escribe, se puede retocar y copiar.
 *
 * @returns el texto y su setter, `escribir()`, `copiar()` y los estados (escribiendo, copiado, error).
 * @example
 * const mensaje = useMensajeSeguimiento(oferta);
 * <button onClick={mensaje.escribir}>Escribir mensaje de seguimiento</button>
 */
export function useMensajeSeguimiento(oferta: Oferta) {
  const [texto, setTexto] = useState(oferta.mensaje_seguimiento ?? "");
  const [copiado, setCopiado] = useState(false);
  const actualizarEnCache = useActualizarOfertaEnCache();

  const escritura = useMutation({
    mutationFn: () => escribirSeguimientoOferta(oferta.id),
    onSuccess: (actualizada) => {
      setTexto(actualizada.mensaje_seguimiento ?? "");
      actualizarEnCache(actualizada);
    },
  });

  const copiar = async () => {
    if (!(await copiarTexto(texto))) return;
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2000);
  };

  return {
    texto,
    setTexto,
    tieneMensaje: texto.trim().length > 0,
    escribir: () => escritura.mutate(),
    escribiendo: escritura.isPending,
    copiar,
    copiado,
    error: escritura.error?.message ?? null,
  };
}
