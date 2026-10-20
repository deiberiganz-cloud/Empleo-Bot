import { useSyncExternalStore } from "react";

export type Tema = "light" | "dark";

const CLAVE_STORAGE = "empleo-bot-tema";
const CONSULTA_OSCURO = "(prefers-color-scheme: dark)";

// localStorage puede fallar (modo privado, almacenamiento bloqueado): en ese caso el tema
// funciona igual, solo que no se recuerda y sigue al sistema.
function leerEleccionGuardada(): Tema | null {
  try {
    const valor = localStorage.getItem(CLAVE_STORAGE);
    return valor === "light" || valor === "dark" ? valor : null;
  } catch {
    return null;
  }
}

function guardarEleccion(tema: Tema): void {
  try {
    localStorage.setItem(CLAVE_STORAGE, tema);
  } catch {
    // Sin almacenamiento: el cambio vale hasta recargar.
  }
}

function temaDelSistema(): Tema {
  return window.matchMedia(CONSULTA_OSCURO).matches ? "dark" : "light";
}

// El atributo de <html> es el estado: lo fija primero el script inline de index.html.
function leerTema(): Tema {
  return document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light";
}

function aplicarTema(tema: Tema): void {
  document.documentElement.setAttribute("data-theme", tema);
}

function suscribirse(avisar: () => void): () => void {
  // Cualquier cambio del atributo (desde cualquier botón) actualiza a todos los que usan el hook.
  const observador = new MutationObserver(avisar);
  observador.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });

  // Mientras la persona no haya elegido, se sigue al sistema operativo en vivo.
  const consulta = window.matchMedia(CONSULTA_OSCURO);
  const alCambiarSistema = () => {
    if (!leerEleccionGuardada()) aplicarTema(temaDelSistema());
  };
  consulta.addEventListener("change", alCambiarSistema);

  return () => {
    observador.disconnect();
    consulta.removeEventListener("change", alCambiarSistema);
  };
}

/**
 * Tema claro/oscuro de toda la app.
 *
 * 1. La primera vez sigue al sistema operativo (y a sus cambios en vivo).
 * 2. Al alternar, cambia `data-theme` en `<html>` (los tokens de index.css hacen el resto)
 *    y guarda la elección en este navegador.
 *
 * @returns `tema` actual y `alternarTema` para pasar de claro a oscuro y viceversa.
 * @example
 * const { tema, alternarTema } = useTema();
 */
export function useTema() {
  const tema = useSyncExternalStore(suscribirse, leerTema);

  const alternarTema = () => {
    const nuevo: Tema = tema === "dark" ? "light" : "dark";
    aplicarTema(nuevo);
    guardarEleccion(nuevo);
  };

  return { tema, alternarTema };
}
