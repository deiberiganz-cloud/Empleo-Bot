import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { buscarAhora, obtenerBusqueda } from "../api/ofertasApi";
import { CLAVE_OFERTAS } from "./useOfertas";

export const CLAVE_BUSQUEDA = ["busqueda"] as const;

// Mientras busca, pregunta seguido para avisar apenas termina; si no, alcanza con una vez por minuto
// (así también se entera de las búsquedas automáticas).
const SEGUNDOS_BUSCANDO = 5;
const SEGUNDOS_ESPERANDO = 60;

/**
 * Estado de la búsqueda de ofertas y el botón "Buscar ahora".
 * Cuando una búsqueda termina (la del botón o la automática), vuelve a pedir las ofertas
 * para que las nuevas aparezcan en la Bandeja sin recargar la página.
 *
 * @returns `estado` (última búsqueda, en curso, próxima), `buscando`, `buscar()` y los errores.
 * @example
 * const busqueda = useBusqueda();
 * busqueda.buscar();
 */
export function useBusqueda() {
  const queryClient = useQueryClient();
  const consulta = useQuery({
    queryKey: CLAVE_BUSQUEDA,
    queryFn: obtenerBusqueda,
    refetchInterval: (query) => (query.state.data?.enCurso ? SEGUNDOS_BUSCANDO : SEGUNDOS_ESPERANDO) * 1000,
  });
  const boton = useMutation({
    mutationFn: buscarAhora,
    onSuccess: (estado) => queryClient.setQueryData(CLAVE_BUSQUEDA, estado),
  });

  const enCurso = consulta.data?.enCurso ?? false;
  const estabaBuscando = useRef(false);
  useEffect(() => {
    if (estabaBuscando.current && !enCurso) queryClient.invalidateQueries({ queryKey: CLAVE_OFERTAS });
    estabaBuscando.current = enCurso;
  }, [enCurso, queryClient]);

  return {
    estado: consulta.data,
    buscando: enCurso || boton.isPending,
    buscar: () => boton.mutate(),
    errorAlBuscar: boton.error?.message ?? null,
    errorCarga: consulta.error?.message ?? null,
  };
}
