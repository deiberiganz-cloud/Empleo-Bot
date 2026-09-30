import type { Estado, Oferta, RespuestaApi } from "../domain/types";

const BASE = "/api/ofertas";

/** Hace el pedido y devuelve el payload, o lanza un Error con el mensaje de la API. */
async function pedir<T>(url: string, opciones?: RequestInit): Promise<T> {
  let respuesta: Response;
  try {
    respuesta = await fetch(url, opciones);
  } catch {
    throw new Error("No se pudo conectar con el servidor. ¿Está abierta la API?");
  }
  const cuerpo = (await respuesta.json().catch(() => null)) as RespuestaApi<T> | null;
  if (!cuerpo) throw new Error(`El servidor respondió con un error (${respuesta.status})`);
  if (cuerpo.status === "error") throw new Error(cuerpo.error);
  return cuerpo.payload;
}

export function listarOfertas(): Promise<Oferta[]> {
  return pedir<Oferta[]>(BASE);
}

/** Le pide a la API que Claude escriba la carta (tarda unos segundos). Devuelve la oferta con la carta. */
export function escribirCartaOferta(id: number): Promise<Oferta> {
  return pedir<Oferta>(`${BASE}/${id}/carta`, { method: "POST" });
}

export function guardarCartaOferta(id: number, carta: string): Promise<Oferta> {
  return pedir<Oferta>(`${BASE}/${id}/carta`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ carta }),
  });
}

export function guardarNotasOferta(id: number, notas: string): Promise<Oferta> {
  return pedir<Oferta>(`${BASE}/${id}/notas`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ notas }),
  });
}

export function cambiarEstadoOferta(id: number, estado: Estado): Promise<Oferta> {
  return pedir<Oferta>(`${BASE}/${id}/estado`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ estado }),
  });
}
