import { useMemo, useState } from "react";
import { contarPorEstado, filtrarOfertas } from "../domain/bandeja";
import type { Estado, TipoOferta } from "../domain/types";
import { useCambiarEstado } from "./useCambiarEstado";
import { useOfertas } from "./useOfertas";

/**
 * Toda la lógica de la pantalla Bandeja (la página solo muestra).
 *
 * 1. Trae las ofertas y guarda los filtros elegidos: pestaña, tipo y "solo recomendadas".
 * 2. Calcula las ofertas visibles y los contadores de cada pestaña.
 * 3. Expone `cambiarEstado` para los botones de las tarjetas.
 *
 * @returns filtros y sus setters, `visibles`, `conteo`, estado de carga, errores y `cambiarEstado`.
 * @example
 * const { visibles, conteo, estado, setEstado, cambiarEstado } = useBandeja();
 */
export function useBandeja() {
  const [estado, setEstado] = useState<Estado>("nueva");
  const [tipo, setTipo] = useState<TipoOferta | null>(null);
  const [soloRecomendadas, setSoloRecomendadas] = useState(true);

  const { data: ofertas = [], isLoading, error: errorCarga, refetch } = useOfertas();
  const mutacion = useCambiarEstado();

  const visibles = useMemo(
    () => filtrarOfertas(ofertas, { estado, tipo, soloRecomendadas }),
    [ofertas, estado, tipo, soloRecomendadas],
  );
  const conteo = useMemo(() => contarPorEstado(ofertas), [ofertas]);
  const ocultasPorRecomendacion =
    estado === "nueva" && soloRecomendadas
      ? filtrarOfertas(ofertas, { estado, tipo, soloRecomendadas: false }).length - visibles.length
      : 0;

  const cambiarEstado = (id: number, destino: Estado) => mutacion.mutate({ id, estado: destino });

  return {
    estado,
    setEstado,
    tipo,
    setTipo,
    soloRecomendadas,
    setSoloRecomendadas,
    visibles,
    conteo,
    ocultasPorRecomendacion,
    isLoading,
    errorCarga: errorCarga?.message ?? null,
    reintentar: refetch,
    cambiarEstado,
    errorCambio: mutacion.error?.message ?? null,
  };
}
