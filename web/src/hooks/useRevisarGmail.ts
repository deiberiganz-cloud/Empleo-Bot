import { useMutation, useQueryClient } from "@tanstack/react-query";
import { revisarGmail } from "../api/ofertasApi";
import { CLAVE_OFERTAS } from "./useOfertas";

/**
 * Botón "Revisar Gmail ahora": le pide a la API que lea el correo en el momento.
 * Al terminar, vuelve a pedir las ofertas para que las tarjetas se muevan.
 *
 * @returns la mutación: `mutate()`, `data` (acciones y errores), `error`, `isPending`.
 * @example
 * const revisar = useRevisarGmail();
 * revisar.mutate();
 */
export function useRevisarGmail() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: revisarGmail,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: CLAVE_OFERTAS }),
  });
}

/** El texto que se muestra al lado del botón después de revisar. */
export function textoRevision(cantidad: number): string {
  if (cantidad === 0) return "Sin novedades en Gmail.";
  return cantidad === 1 ? "1 novedad: ya está en el tablero." : `${cantidad} novedades: ya están en el tablero.`;
}
