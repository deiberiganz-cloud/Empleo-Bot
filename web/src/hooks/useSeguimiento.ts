import { useMemo } from "react";
import { COLUMNAS, resumirSeguimiento } from "../domain/seguimiento";
import type { Estado } from "../domain/types";
import { useCambiarEstado } from "./useCambiarEstado";
import { useOfertaAbierta } from "./useOfertaAbierta";
import { useOfertas } from "./useOfertas";

/**
 * Lógica de la pantalla Seguimiento (la página solo muestra).
 *
 * 1. Reparte las ofertas en las columnas del tablero (Me interesa → Postulé → Entrevista → Resultado).
 * 2. Calcula el resumen de arriba: postulaciones de la semana, entrevistas y tasa de respuesta.
 * 3. Expone `cambiarEstado` para las flechas y la oferta abierta en el panel de detalle.
 *
 * @returns `columnas` (cada una con sus ofertas), `resumen`, carga, errores, `cambiarEstado` y el detalle.
 * @example
 * const { columnas, resumen, cambiarEstado } = useSeguimiento();
 */
export function useSeguimiento() {
  const { data: ofertas = [], isLoading, error: errorCarga, refetch } = useOfertas();
  const mutacion = useCambiarEstado();
  const detalle = useOfertaAbierta(ofertas);

  const columnas = useMemo(
    () =>
      COLUMNAS.map((columna) => ({
        ...columna,
        ofertas: ofertas
          .filter((oferta) => columna.estados.includes(oferta.estado))
          // Lo que se movió hace más tiempo, arriba: es lo que primero hay que mirar.
          .sort((a, b) => (a.estado_actualizado ?? "").localeCompare(b.estado_actualizado ?? "")),
      })),
    [ofertas],
  );
  const resumen = useMemo(() => resumirSeguimiento(ofertas), [ofertas]);

  return {
    columnas,
    resumen,
    isLoading,
    errorCarga: errorCarga?.message ?? null,
    reintentar: refetch,
    cambiarEstado: (id: number, destino: Estado) => mutacion.mutate({ id, estado: destino }),
    errorCambio: mutacion.error?.message ?? null,
    ...detalle,
  };
}
