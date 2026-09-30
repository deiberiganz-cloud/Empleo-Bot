import { useQueryClient } from "@tanstack/react-query";
import type { Oferta } from "../domain/types";
import { CLAVE_OFERTAS } from "./useOfertas";

/**
 * Devuelve una función que reemplaza una oferta en la lista guardada por TanStack Query,
 * con la versión que devolvió la API. Así la Bandeja se entera sin volver a pedir todo.
 *
 * @example
 * const actualizarEnCache = useActualizarOfertaEnCache();
 * actualizarEnCache(ofertaQueDevolvioLaApi);
 */
export function useActualizarOfertaEnCache() {
  const queryClient = useQueryClient();
  return (actualizada: Oferta) =>
    queryClient.setQueryData<Oferta[]>(CLAVE_OFERTAS, (ofertas = []) =>
      ofertas.map((oferta) => (oferta.id === actualizada.id ? actualizada : oferta)),
    );
}
