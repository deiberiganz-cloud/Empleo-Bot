import type { Busqueda } from "./types";

const DIA = 86400000;

const dosDigitos = (n: number) => String(n).padStart(2, "0");

/**
 * Fecha corta y en hora local: "hoy 15:20", "ayer 09:05" o "28/09 15:20".
 *
 * @example cuando(new Date(2026, 9, 2, 15, 20).toISOString(), new Date(2026, 9, 2, 18, 0)) // "hoy 15:20"
 */
export function cuando(iso: string, ahora = new Date()): string {
  const fecha = new Date(iso);
  const hora = `${dosDigitos(fecha.getHours())}:${dosDigitos(fecha.getMinutes())}`;
  const inicioDelDia = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const dias = Math.round((inicioDelDia(ahora) - inicioDelDia(fecha)) / DIA);
  if (dias === 0) return `hoy ${hora}`;
  if (dias === 1) return `ayer ${hora}`;
  if (dias === -1) return `mañana ${hora}`;
  return `${dosDigitos(fecha.getDate())}/${dosDigitos(fecha.getMonth() + 1)} ${hora}`;
}

/** "Última búsqueda: hoy 15:20 · 8 nuevas, 3 recomendadas". */
export function textoUltimaBusqueda(ultima: Busqueda | null, ahora = new Date()): string {
  if (!ultima) return "Todavía no se buscó ninguna vez.";
  const nuevas =
    ultima.nuevas === 0
      ? "sin ofertas nuevas"
      : `${ultima.nuevas} ${ultima.nuevas === 1 ? "nueva" : "nuevas"}, ${ultima.buenas} ${ultima.buenas === 1 ? "recomendada" : "recomendadas"}`;
  return `Última búsqueda: ${cuando(ultima.fecha, ahora)} · ${nuevas}`;
}

/** "Próxima: hoy 21:20", o qué pasa si ya toca. */
export function textoProxima(proxima: string | null, ahora = new Date()): string {
  return proxima ? `Próxima: ${cuando(proxima, ahora)}` : "Busca sola apenas puede.";
}

/** "1 fuente no respondió" o "2 avisos", para no llenar la pantalla con los errores completos. */
export function textoAvisos(errores: string[]): string | null {
  if (errores.length === 0) return null;
  return errores.length === 1 ? "1 aviso" : `${errores.length} avisos`;
}
