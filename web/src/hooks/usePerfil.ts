import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import * as api from "../api/perfilApi";
import type { Perfil, RespuestaPerfil } from "../domain/types";

export const CLAVE_PERFIL = ["perfil"] as const;

/**
 * Trae el perfil guardado (datos, si hay foto y los CV).
 *
 * @returns el resultado de TanStack Query: `data`, `isLoading`, `error`, `refetch`.
 * @example
 * const { data, isLoading } = usePerfil();
 */
export function usePerfil() {
  return useQuery({ queryKey: CLAVE_PERFIL, queryFn: api.obtenerPerfil });
}

/**
 * El formulario de la pestaña Perfil: un borrador que se edita en la pantalla y se guarda entero
 * con "Guardar cambios" (así no se manda un pedido por cada letra).
 *
 * @param guardado los datos tal como están en la base
 * @returns el `perfil` en edición, `editar` para cambiarlo, si hay `cambios` sin guardar y `guardar`.
 * @example
 * const form = useFormularioPerfil(data.datos);
 * form.editar((p) => ({ ...p, titulo: "Desarrollador Full Stack" }));
 */
export function useFormularioPerfil(guardado: Perfil) {
  const [perfil, setPerfil] = useState(guardado);
  const [base, setBase] = useState(guardado);
  const queryClient = useQueryClient();

  const guardadoMutacion = useMutation({
    mutationFn: api.guardarPerfil,
    onSuccess: (respuesta) => {
      queryClient.setQueryData(CLAVE_PERFIL, respuesta);
      // Lo que vuelve ya viene limpio (sin ítems vacíos): eso pasa a ser el formulario.
      setPerfil(respuesta.datos);
      setBase(respuesta.datos);
    },
  });

  const cambios = JSON.stringify(perfil) !== JSON.stringify(base);

  return {
    perfil,
    editar: (cambio: (actual: Perfil) => Perfil) => setPerfil(cambio),
    cambios,
    guardar: () => guardadoMutacion.mutate(perfil),
    guardando: guardadoMutacion.isPending,
    guardadoOk: guardadoMutacion.isSuccess && !cambios,
    error: guardadoMutacion.error?.message ?? null,
  };
}

/**
 * Foto y CV: se suben y se cambian al momento (no esperan a "Guardar cambios").
 *
 * @returns las acciones y el error de la última que falló.
 * @example
 * const archivos = useArchivosPerfil();
 * archivos.subirCv(archivo);
 */
export function useArchivosPerfil() {
  const queryClient = useQueryClient();
  const alTerminar = (respuesta: RespuestaPerfil) => queryClient.setQueryData(CLAVE_PERFIL, respuesta);

  const foto = useMutation({ mutationFn: api.subirFoto, onSuccess: alTerminar });
  const subida = useMutation({ mutationFn: api.subirCv, onSuccess: alTerminar });
  const cambio = useMutation({
    mutationFn: ({ id, cambios }: { id: number; cambios: { nombre?: string; predeterminado?: true } }) =>
      api.cambiarCv(id, cambios),
    onSuccess: alTerminar,
  });
  const baja = useMutation({ mutationFn: api.quitarCv, onSuccess: alTerminar });

  return {
    subirFoto: (archivo: File) => foto.mutate(archivo),
    subiendoFoto: foto.isPending,
    subirCv: (archivo: File) => subida.mutate(archivo),
    subiendoCv: subida.isPending,
    renombrarCv: (id: number, nombre: string) => cambio.mutate({ id, cambios: { nombre } }),
    marcarPredeterminado: (id: number) => cambio.mutate({ id, cambios: { predeterminado: true } }),
    quitarCv: (id: number) => baja.mutate(id),
    error: (foto.error ?? subida.error ?? cambio.error ?? baja.error)?.message ?? null,
  };
}
