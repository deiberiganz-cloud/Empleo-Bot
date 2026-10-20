import type { Perfil, RespuestaApi, RespuestaPerfil } from "../domain/types";

const BASE = "/api/perfil";

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

/** Dirección de la foto de perfil. `version` evita que el navegador muestre la vieja después de cambiarla. */
export const urlFoto = (version: string | null) => `${BASE}/foto?v=${encodeURIComponent(version ?? "")}`;

/** Dirección para abrir un CV en otra pestaña. */
export const urlCv = (id: number) => `${BASE}/cvs/${id}`;

export function obtenerPerfil(): Promise<RespuestaPerfil> {
  return pedir<RespuestaPerfil>(BASE);
}

/** Guarda todo el formulario de una vez. */
export function guardarPerfil(datos: Perfil): Promise<RespuestaPerfil> {
  return pedir<RespuestaPerfil>(BASE, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(datos),
  });
}

/** Sube la foto tal cual (JPG, PNG o WebP). */
export function subirFoto(archivo: File): Promise<RespuestaPerfil> {
  return pedir<RespuestaPerfil>(`${BASE}/foto`, {
    method: "PUT",
    headers: { "Content-Type": archivo.type },
    body: archivo,
  });
}

/** Sube un CV en PDF. El nombre del archivo va en un encabezado (el cuerpo es el PDF crudo). */
export function subirCv(archivo: File): Promise<RespuestaPerfil> {
  return pedir<RespuestaPerfil>(`${BASE}/cvs`, {
    method: "POST",
    headers: { "Content-Type": "application/pdf", "X-Nombre-Archivo": encodeURIComponent(archivo.name) },
    body: archivo,
  });
}

/** Renombra un CV o lo deja como predeterminado. */
export function cambiarCv(id: number, cambios: { nombre?: string; predeterminado?: true }): Promise<RespuestaPerfil> {
  return pedir<RespuestaPerfil>(`${BASE}/cvs/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(cambios),
  });
}

export function quitarCv(id: number): Promise<RespuestaPerfil> {
  return pedir<RespuestaPerfil>(`${BASE}/cvs/${id}`, { method: "DELETE" });
}
