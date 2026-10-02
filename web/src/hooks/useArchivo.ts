import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { listarArchivadas, obtenerHistorial } from "../api/ofertasApi";
import { ordenarArchivo, tilesHistorial } from "../domain/archivo";
import { useCambiarEstado } from "./useCambiarEstado";
import { CLAVE_OFERTAS } from "./useOfertas";

/**
 * Lógica de la pantalla Archivo (la página solo muestra).
 *
 * 1. Trae las ofertas archivadas y el historial de toda la búsqueda (incluye lo ya borrado).
 *    Las claves empiezan con "ofertas": cuando se cambia un estado, se refrescan solas.
 * 2. Expone `recuperar` para devolver a "Me interesa" una oferta descartada por error.
 *
 * @returns `ofertas`, `tiles` del historial, carga, error y `recuperar`.
 * @example
 * const { ofertas, tiles, recuperar } = useArchivo();
 */
export function useArchivo() {
  const archivadas = useQuery({ queryKey: [...CLAVE_OFERTAS, "archivadas"], queryFn: listarArchivadas });
  const historial = useQuery({ queryKey: [...CLAVE_OFERTAS, "historial"], queryFn: obtenerHistorial });
  const mutacion = useCambiarEstado();

  const ofertas = useMemo(() => ordenarArchivo(archivadas.data ?? []), [archivadas.data]);
  const tiles = useMemo(() => (historial.data ? tilesHistorial(historial.data) : null), [historial.data]);

  return {
    ofertas,
    tiles,
    isLoading: archivadas.isLoading,
    errorCarga: archivadas.error?.message ?? null,
    reintentar: () => archivadas.refetch(),
    recuperar: (id: number) => mutacion.mutate({ id, estado: "me_interesa" }),
    errorCambio: mutacion.error?.message ?? null,
  };
}
