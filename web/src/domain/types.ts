// ─── OFERTAS ───

export type Estado =
  | "nueva"
  | "me_interesa"
  | "descartada"
  | "postulada"
  | "entrevista"
  | "oferta"
  | "rechazada";

export type TipoOferta = "dev" | "automatizacion" | "ecommerce" | "soporte" | "otro";

/** Una oferta tal como la devuelve la API (/api/ofertas). */
export interface Oferta {
  id: number;
  url: string;
  titulo: string;
  empresa: string | null;
  fuente: string | null;
  ubicacion: string | null;
  descripcion: string | null;
  fecha_publicacion: string | null;
  encontrada: string;
  puntaje: number | null;
  tipo: TipoOferta | null;
  motivo: string | null;
  postular: boolean;
  estafa: boolean;
  estado: Estado;
  estado_actualizado: string | null;
  notas: string | null;
  carta: string | null;
  fecha_postulacion: string | null;
  fecha_entrevista: string | null;
  mensaje_seguimiento: string | null;
  /** Versión corta de la carta: mensaje para el reclutador por LinkedIn. */
  mensaje_corto: string | null;
  /** Cuándo pasó al Archivo (texto ISO), o null si sigue activa. */
  archivada: string | null;
}

/** Lo que cambió el seguimiento por Gmail (/api/ofertas/revisar-gmail). */
export interface RevisionGmail {
  acciones: { titulo: string; empresa: string | null; accion: string }[];
  errores: string[];
}

/** Una búsqueda de ofertas terminada (la anota evaluar.js). */
export interface Busqueda {
  /** Cuándo terminó (texto ISO). */
  fecha: string;
  /** Ofertas que pasaron el prefiltro. */
  recibidas: number;
  /** Ofertas nuevas que Claude evaluó y quedaron en la Bandeja. */
  nuevas: number;
  /** De las nuevas, las que Claude recomienda. */
  buenas: number;
  /** Fuentes que no respondieron o lotes que Claude no pudo evaluar. */
  errores: string[];
}

/** Estado de la búsqueda de ofertas (/api/busqueda). */
export interface EstadoBusqueda {
  ultima: Busqueda | null;
  enCurso: boolean;
  /** Error de la última búsqueda que falló entera (se borra cuando una sale bien). */
  error: string | null;
  /** Cuándo toca la próxima búsqueda automática (texto ISO), o null si toca ya. */
  proxima: string | null;
}

/** Totales de toda la búsqueda, incluidas las ofertas ya borradas (/api/ofertas/historial). */
export interface Historial {
  postuladas: number;
  porEstado: Partial<Record<Estado, number>>;
}

// ─── RESPUESTAS DE LA API ───

export type RespuestaApi<T> = { status: "success"; payload: T } | { status: "error"; error: string };

// ─── BANDEJA ───

/** Pestañas de la Bandeja (decidir). Lo postulado se sigue en la pantalla Seguimiento. */
export const PESTANAS: { estado: Estado; etiqueta: string }[] = [
  { estado: "nueva", etiqueta: "Nuevas" },
  { estado: "me_interesa", etiqueta: "Me interesan" },
  { estado: "descartada", etiqueta: "Descartadas" },
];

export const TIPOS: { valor: TipoOferta | null; etiqueta: string }[] = [
  { valor: null, etiqueta: "Todos" },
  { valor: "dev", etiqueta: "Dev" },
  { valor: "soporte", etiqueta: "Soporte" },
  { valor: "ecommerce", etiqueta: "E-commerce" },
  { valor: "automatizacion", etiqueta: "Automatización" },
  { valor: "otro", etiqueta: "Otro" },
];

export interface FiltroBandeja {
  estado: Estado;
  tipo: TipoOferta | null;
  soloRecomendadas: boolean;
}

/** Un botón de acción de la tarjeta: qué dice y a qué estado mueve la oferta. */
export interface Accion {
  etiqueta: string;
  destino: Estado;
  principal?: boolean;
}
