import { useSyncExternalStore } from "react";

const CLAVE_STORAGE = "empleo-bot-sonido";

// localStorage puede fallar (modo privado, almacenamiento bloqueado): en ese caso el sonido
// arranca apagado y la elección vale hasta recargar.
function leerEleccionGuardada(): boolean {
  try {
    return localStorage.getItem(CLAVE_STORAGE) === "on";
  } catch {
    return false;
  }
}

function guardarEleccion(prendido: boolean): void {
  try {
    localStorage.setItem(CLAVE_STORAGE, prendido ? "on" : "off");
  } catch {
    // Sin almacenamiento: el cambio vale hasta recargar.
  }
}

// El estado vive acá (no en un componente) porque lo usan dos: el botón del encabezado y el robot.
let prendido = leerEleccionGuardada();
const oyentes = new Set<() => void>();

function suscribirse(avisar: () => void): () => void {
  oyentes.add(avisar);
  return () => oyentes.delete(avisar);
}

function alternar(): void {
  prendido = !prendido;
  guardarEleccion(prendido);
  oyentes.forEach((avisar) => avisar());
}

/**
 * Sonido del robot (la flauta y los efectos). Arranca apagado y recuerda la última elección en este navegador.
 *
 * @returns `prendido` y `alternarSonido` para prenderlo o apagarlo.
 * @example
 * const { prendido, alternarSonido } = useSonido();
 */
export function useSonido() {
  const estaPrendido = useSyncExternalStore(suscribirse, () => prendido);
  return { prendido: estaPrendido, alternarSonido: alternar };
}
