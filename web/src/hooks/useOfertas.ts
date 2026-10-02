import { useQuery } from "@tanstack/react-query";
import { listarOfertas } from "../api/ofertasApi";

export const CLAVE_OFERTAS = ["ofertas"] as const;

// La API mueve tarjetas sola (Gmail cada 10 minutos, búsqueda cada 12 horas): la pantalla vuelve a
// pedir las ofertas cada minuto para mostrarlo sin recargar. Es una consulta chica a la base local.
const SEGUNDOS_ENTRE_ACTUALIZACIONES = 60;

/**
 * Trae todas las ofertas de la API. Son pocas (cientos), así que se filtran en el navegador:
 * cambiar de pestaña o de tipo es instantáneo y los contadores salen de la misma lista.
 *
 * @returns el resultado de TanStack Query: `data`, `isLoading`, `error`, `refetch`.
 * @example
 * const { data: ofertas = [], isLoading } = useOfertas();
 */
export function useOfertas() {
  return useQuery({
    queryKey: CLAVE_OFERTAS,
    queryFn: listarOfertas,
    refetchInterval: SEGUNDOS_ENTRE_ACTUALIZACIONES * 1000,
  });
}
