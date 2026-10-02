import type { Estado, EstadoBusqueda, Historial, Oferta, RespuestaApi, RevisionGmail } from "../domain/types";

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

/** Las ofertas del Archivo (cerradas hace 7 días o más; se borran a los 30). */
export function listarArchivadas(): Promise<Oferta[]> {
  return pedir<Oferta[]>(`${BASE}?archivadas=1`);
}

/** Revisa Gmail en el momento (la API también lo hace sola cada 30 minutos). */
export function revisarGmail(): Promise<RevisionGmail> {
  return pedir<RevisionGmail>(`${BASE}/revisar-gmail`, { method: "POST" });
}

/** Cómo fue la última búsqueda de ofertas y si hay una en curso. */
export function obtenerBusqueda(): Promise<EstadoBusqueda> {
  return pedir<EstadoBusqueda>("/api/busqueda");
}

/** "Buscar ahora": la API arranca la búsqueda y responde enseguida (la búsqueda tarda unos minutos). */
export function buscarAhora(): Promise<EstadoBusqueda> {
  return pedir<EstadoBusqueda>("/api/busqueda", { method: "POST" });
}

export function obtenerHistorial(): Promise<Historial> {
  return pedir<Historial>(`${BASE}/historial`);
}

/** Le pide a la API que Claude escriba la carta (tarda unos segundos). Devuelve la oferta con la carta. */
export function escribirCartaOferta(id: number): Promise<Oferta> {
  return pedir<Oferta>(`${BASE}/${id}/carta`, { method: "POST" });
}

/** La versión corta: un mensaje de 40 a 70 palabras para el reclutador por LinkedIn. */
export function escribirMensajeCortoOferta(id: number): Promise<Oferta> {
  return pedir<Oferta>(`${BASE}/${id}/mensaje-corto`, { method: "POST" });
}

export function guardarMensajeCortoOferta(id: number, mensaje: string): Promise<Oferta> {
  return pedir<Oferta>(`${BASE}/${id}/mensaje-corto`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mensaje }),
  });
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

/** Fecha y hora de la entrevista (texto de un input datetime-local) o null para borrarla. */
export function guardarEntrevistaOferta(id: number, fecha: string | null): Promise<Oferta> {
  return pedir<Oferta>(`${BASE}/${id}/entrevista`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fecha }),
  });
}

/** Le pide a Claude un mensaje corto para preguntar cómo sigue el proceso. */
export function escribirSeguimientoOferta(id: number): Promise<Oferta> {
  return pedir<Oferta>(`${BASE}/${id}/seguimiento`, { method: "POST" });
}

export function cambiarEstadoOferta(id: number, estado: Estado): Promise<Oferta> {
  return pedir<Oferta>(`${BASE}/${id}/estado`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ estado }),
  });
}
