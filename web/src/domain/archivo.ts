import type { Estado, Historial, Oferta } from "./types";

/** Días que una oferta queda en el Archivo antes de que el bot la borre (igual que en la API). */
export const DIAS_EN_ARCHIVO = 30;

const DIA = 24 * 60 * 60 * 1000;

/** Cómo terminó la oferta, en palabras. */
export const FINAL: Partial<Record<Estado, string>> = {
  descartada: "La descartaste",
  rechazada: "✖ Rechazo",
  oferta: "✔ Oferta",
};

/** Fecha (dd/mm) en la que el bot borra una oferta archivada, o null si no está archivada. */
export function fechaBorrado(oferta: Pick<Oferta, "archivada">): string | null {
  if (!oferta.archivada) return null;
  const borrado = new Date(new Date(oferta.archivada).getTime() + DIAS_EN_ARCHIVO * DIA);
  return borrado.toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit" });
}

/** El Archivo, de lo último archivado a lo más viejo. */
export function ordenarArchivo(ofertas: Oferta[]): Oferta[] {
  return [...ofertas].sort((a, b) => (b.archivada ?? "").localeCompare(a.archivada ?? ""));
}

/** Los cuatro números del historial (incluye lo que ya se borró). */
export function tilesHistorial(historial: Historial) {
  const cuenta = (estado: Estado) => historial.porEstado[estado] ?? 0;
  return [
    { etiqueta: "Postulaciones", valor: historial.postuladas },
    { etiqueta: "Entrevistas", valor: cuenta("entrevista") },
    { etiqueta: "Ofertas", valor: cuenta("oferta") },
    { etiqueta: "Rechazos", valor: cuenta("rechazada") },
  ];
}
