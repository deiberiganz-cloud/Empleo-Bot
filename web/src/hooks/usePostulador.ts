import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { obtenerPostulador, reintentarPostulacion } from "../api/ofertasApi";
import { postuladorActivo } from "../domain/postulador";
import { CLAVE_OFERTAS } from "./useOfertas";

export const CLAVE_POSTULADOR = ["postulador"] as const;

// Mientras hay una oferta postulándose o en fila, pregunta seguido para mostrar el avance;
// si no, una vez por minuto alcanza (así se entera de lo que acepte desde otra pestaña).
const SEGUNDOS_TRABAJANDO = 5;
const SEGUNDOS_EN_REPOSO = 60;

/**
 * Estado del postulador y el botón "Reintentar" de las ofertas bloqueadas.
 * Cuando termina de postular una oferta (cambia la que está en curso), vuelve a pedir las ofertas
 * para que la tarjeta se mueva de columna sin esperar el minuto de la pantalla.
 *
 * @returns `estado` (en curso, en fila, intentos de hoy), `reintentar(id)` y `errorAlReintentar`.
 * @example
 * const postulador = usePostulador();
 * postulador.reintentar(oferta.id);
 */
export function usePostulador() {
  const queryClient = useQueryClient();
  const consulta = useQuery({
    queryKey: CLAVE_POSTULADOR,
    queryFn: obtenerPostulador,
    refetchInterval: (query) => (postuladorActivo(query.state.data) ? SEGUNDOS_TRABAJANDO : SEGUNDOS_EN_REPOSO) * 1000,
  });
  const boton = useMutation({
    mutationFn: (id: number) => reintentarPostulacion(id),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: CLAVE_OFERTAS });
      queryClient.invalidateQueries({ queryKey: CLAVE_POSTULADOR });
    },
  });

  const idEnCurso = consulta.data?.enCurso?.id ?? null;
  const idAnterior = useRef<number | null>(null);
  useEffect(() => {
    if (idAnterior.current !== idEnCurso) queryClient.invalidateQueries({ queryKey: CLAVE_OFERTAS });
    idAnterior.current = idEnCurso;
  }, [idEnCurso, queryClient]);

  return {
    estado: consulta.data,
    reintentar: (id: number) => boton.mutate(id),
    errorAlReintentar: boton.error?.message ?? null,
  };
}
