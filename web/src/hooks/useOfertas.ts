import { useQuery } from "@tanstack/react-query";
import { listarOfertas } from "../api/ofertasApi";

export const CLAVE_OFERTAS = ["ofertas"] as const;

/**
 * Trae todas las ofertas de la API. Son pocas (cientos), así que se filtran en el navegador:
 * cambiar de pestaña o de tipo es instantáneo y los contadores salen de la misma lista.
 *
 * @returns el resultado de TanStack Query: `data`, `isLoading`, `error`, `refetch`.
 * @example
 * const { data: ofertas = [], isLoading } = useOfertas();
 */
export function useOfertas() {
  return useQuery({ queryKey: CLAVE_OFERTAS, queryFn: listarOfertas });
}
