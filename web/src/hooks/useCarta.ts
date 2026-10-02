import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import {
  escribirCartaOferta,
  escribirMensajeCortoOferta,
  guardarCartaOferta,
  guardarMensajeCortoOferta,
} from "../api/ofertasApi";
import type { Oferta } from "../domain/types";
import { useActualizarOfertaEnCache } from "./useActualizarOfertaEnCache";
import { copiarTexto } from "../utils/copiarTexto";

/** Las dos versiones: la carta completa (formularios) y el mensaje corto (LinkedIn). */
export type VersionCarta = "completa" | "corta";

const VERSIONES = {
  completa: { leer: (o: Oferta) => o.carta, escribir: escribirCartaOferta, guardar: guardarCartaOferta },
  corta: { leer: (o: Oferta) => o.mensaje_corto, escribir: escribirMensajeCortoOferta, guardar: guardarMensajeCortoOferta },
} as const;

/**
 * Lógica de la carta de presentación de una oferta, en cualquiera de sus dos versiones.
 *
 * 1. `escribir()` le pide a Claude un texto nuevo (tarda unos segundos) y lo muestra.
 * 2. El texto se puede editar; `hayCambios` dice si difiere de lo guardado y `guardar()` lo guarda.
 * 3. `copiar()` lo copia al portapapeles (también desde el celular) para pegarlo donde haga falta.
 *
 * El componente que lo usa se monta con `key`, así el texto arranca de cero con cada oferta y versión.
 *
 * @returns el texto y su setter, las acciones y los estados (escribiendo, guardando, copiado, error).
 * @example
 * const carta = useCarta(oferta, "corta");
 * <textarea value={carta.texto} onChange={(e) => carta.setTexto(e.target.value)} />
 */
export function useCarta(oferta: Oferta, version: VersionCarta = "completa") {
  const { leer, escribir, guardar } = VERSIONES[version];
  const [texto, setTexto] = useState(leer(oferta) ?? "");
  const [copiado, setCopiado] = useState(false);
  const actualizarEnCache = useActualizarOfertaEnCache();

  const escritura = useMutation({
    mutationFn: () => escribir(oferta.id),
    onSuccess: (actualizada) => {
      setTexto(leer(actualizada) ?? "");
      actualizarEnCache(actualizada);
    },
  });

  const guardado = useMutation({
    mutationFn: () => guardar(oferta.id, texto),
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
    hayCambios: texto !== (leer(oferta) ?? ""),
    escribir: () => escritura.mutate(),
    escribiendo: escritura.isPending,
    guardar: () => guardado.mutate(),
    guardando: guardado.isPending,
    copiar,
    copiado,
    error: escritura.error?.message ?? guardado.error?.message ?? null,
  };
}
