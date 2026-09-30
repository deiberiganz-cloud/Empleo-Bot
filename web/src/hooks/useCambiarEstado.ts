import { useMutation, useQueryClient } from "@tanstack/react-query";
import { cambiarEstadoOferta } from "../api/ofertasApi";
import type { Estado, Oferta } from "../domain/types";
import { CLAVE_OFERTAS } from "./useOfertas";

/**
 * Cambia el estado de una oferta con actualización optimista.
 *
 * 1. Antes de llamar a la API, mueve la oferta en la lista local: la tarjeta cambia de pestaña al instante.
 * 2. Si la API falla, vuelve la lista a como estaba y deja el error en `error`.
 * 3. Al terminar (bien o mal), vuelve a pedir la lista para quedar igual que el servidor.
 *
 * @returns la mutación: `mutate({ id, estado })`, `error`, `variables`, `isPending`.
 * @example
 * const cambiarEstado = useCambiarEstado();
 * cambiarEstado.mutate({ id: oferta.id, estado: "me_interesa" });
 */
export function useCambiarEstado() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, estado }: { id: number; estado: Estado }) => cambiarEstadoOferta(id, estado),

    onMutate: async ({ id, estado }) => {
      await queryClient.cancelQueries({ queryKey: CLAVE_OFERTAS });
      const anterior = queryClient.getQueryData<Oferta[]>(CLAVE_OFERTAS);
      queryClient.setQueryData<Oferta[]>(CLAVE_OFERTAS, (ofertas = []) =>
        ofertas.map((oferta) => (oferta.id === id ? { ...oferta, estado } : oferta)),
      );
      return { anterior };
    },

    onError: (_error, _variables, contexto) => {
      if (contexto?.anterior) queryClient.setQueryData(CLAVE_OFERTAS, contexto.anterior);
    },

    onSettled: () => queryClient.invalidateQueries({ queryKey: CLAVE_OFERTAS }),
  });
}
