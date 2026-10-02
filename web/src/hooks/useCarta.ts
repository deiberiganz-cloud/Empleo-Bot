import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { escribirCartaOferta, guardarCartaOferta } from "../api/ofertasApi";
import type { Oferta } from "../domain/types";
import { useActualizarOfertaEnCache } from "./useActualizarOfertaEnCache";
import { copiarTexto } from "../utils/copiarTexto";

/**
 * Lógica de la carta de presentación de una oferta.
 *
 * 1. `escribir()` le pide a Claude una carta nueva (tarda unos segundos) y la muestra.
 * 2. El texto se puede editar; `hayCambios` dice si difiere de lo guardado y `guardar()` lo guarda.
 * 3. `copiar()` la copia al portapapeles para pegarla en el formulario de la empresa.
 *
 * El componente que lo usa se monta con `key={oferta.id}`, así el texto arranca de cero con cada oferta.
 *
 * @returns el texto y su setter, las acciones y los estados (escribiendo, guardando, copiado, error).
 * @example
 * const carta = useCarta(oferta);
 * <textarea value={carta.texto} onChange={(e) => carta.setTexto(e.target.value)} />
 */
export function useCarta(oferta: Oferta) {
  const [texto, setTexto] = useState(oferta.carta ?? "");
  const [copiado, setCopiado] = useState(false);
  const actualizarEnCache = useActualizarOfertaEnCache();

  const escritura = useMutation({
    mutationFn: () => escribirCartaOferta(oferta.id),
    onSuccess: (actualizada) => {
      setTexto(actualizada.carta ?? "");
      actualizarEnCache(actualizada);
    },
  });

  const guardado = useMutation({
    mutationFn: () => guardarCartaOferta(oferta.id, texto),
    onSuccess: actualizarEnCache,
  });

  const copiar = async () => {
    if (!(await copiarTexto(texto))) return;
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2000);
  };

  return {
    texto,
    setTexto,
    tieneCarta: texto.trim().length > 0,
    hayCambios: texto !== (oferta.carta ?? ""),
    escribir: () => escritura.mutate(),
    escribiendo: escritura.isPending,
    guardar: () => guardado.mutate(),
    guardando: guardado.isPending,
    copiar,
    copiado,
    error: escritura.error?.message ?? guardado.error?.message ?? null,
  };
}
