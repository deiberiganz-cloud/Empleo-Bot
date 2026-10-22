import type { Cv, Experiencia, Perfil } from "./types";

/** Un perfil sin datos: la forma completa, para arrancar el formulario. */
export const PERFIL_VACIO: Perfil = {
  personales: {
    nombre: "",
    fechaNacimiento: "",
    ciudad: "",
    provincia: "",
    pais: "",
    direccion: "",
    codigoPostal: "",
    dni: "",
    telefono: "",
    email: "",
  },
  links: [],
  titulo: "",
  presentacion: "",
  habilidades: [],
  experiencias: [],
  idiomas: [],
  busqueda: {
    puestos: [],
    modalidad: "",
    paises: "",
    sueldo: "",
    moneda: "",
    disponibilidad: "",
    seniority: "",
    noSirve: "",
    niveles: [],
  },
  respuestas: [],
};

/** Los niveles de seniority (el mismo orden y texto que busqueda/niveles.js). */
export const NIVELES_BUSQUEDA = ["Trainee", "Junior", "Semi senior", "Senior", "Lead / Staff", "Principal / Gerencia"];

export const NIVELES_IDIOMA = [
  "Nativo",
  "Básico (A1)",
  "Básico (A2)",
  "Intermedio (B1)",
  "Intermedio alto (B2)",
  "Avanzado (C1)",
  "Bilingüe (C2)",
];

export const EXPERIENCIA_VACIA = (tipo: Experiencia["tipo"]): Experiencia => ({
  tipo,
  titulo: "",
  lugar: "",
  desde: "",
  hasta: "",
  descripcion: "",
});

/**
 * Lo que mira la barra "Perfil completo al X %": lo que más piden los formularios.
 * Cada punto que falta se muestra con su nombre para saber qué cargar.
 */
export function completitud(perfil: Perfil, tieneFoto: boolean, cvs: Cv[]) {
  const { personales: yo } = perfil;
  const puntos: [string, boolean][] = [
    ["nombre", Boolean(yo.nombre)],
    ["teléfono", Boolean(yo.telefono)],
    ["email", Boolean(yo.email)],
    ["dirección y código postal", Boolean(yo.direccion && yo.codigoPostal)],
    ["foto", tieneFoto],
    ["CV", cvs.length > 0],
    ["presentación", Boolean(perfil.presentacion)],
    ["habilidades", perfil.habilidades.length > 0],
    ["experiencia", perfil.experiencias.some((exp) => exp.tipo === "trabajo")],
    ["estudios", perfil.experiencias.some((exp) => exp.tipo === "estudio")],
    ["idiomas", perfil.idiomas.length > 0],
    ["puestos que buscas", perfil.busqueda.puestos.length > 0],
    ["respuestas frecuentes", perfil.respuestas.length > 0],
  ];
  const cumplidos = puntos.filter(([, ok]) => ok).length;
  return {
    porcentaje: Math.round((cumplidos / puntos.length) * 100),
    faltan: puntos.filter(([, ok]) => !ok).map(([nombre]) => nombre),
  };
}

/** Mueve un ítem de la lista un lugar arriba (-1) o abajo (+1). Si ya está en la punta, la deja igual. */
export function mover<T>(lista: T[], indice: number, direccion: -1 | 1): T[] {
  const destino = indice + direccion;
  if (destino < 0 || destino >= lista.length) return lista;
  const copia = [...lista];
  [copia[indice], copia[destino]] = [copia[destino], copia[indice]];
  return copia;
}

/** Cambia un ítem de la lista sin tocar los demás. */
export function reemplazar<T>(lista: T[], indice: number, cambios: Partial<T>): T[] {
  return lista.map((item, i) => (i === indice ? { ...item, ...cambios } : item));
}

/** Saca un ítem de la lista. */
export function quitar<T>(lista: T[], indice: number): T[] {
  return lista.filter((_, i) => i !== indice);
}

/** "123 KB" o "1,2 MB". */
export function tamanoLegible(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toLocaleString("es-AR", { maximumFractionDigits: 1 })} MB`;
}

/** "sept. 2026 – actualidad" o "2019 – 2024". */
export function periodo(exp: Pick<Experiencia, "desde" | "hasta">): string {
  return [exp.desde, exp.hasta].filter(Boolean).join(" – ");
}
