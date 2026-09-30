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
}

// ─── RESPUESTAS DE LA API ───

export type RespuestaApi<T> = { status: "success"; payload: T } | { status: "error"; error: string };

// ─── BANDEJA ───

/** Pestañas de la Bandeja, en el orden en que se muestran. */
export const PESTANAS: { estado: Estado; etiqueta: string }[] = [
  { estado: "nueva", etiqueta: "Nuevas" },
  { estado: "me_interesa", etiqueta: "Me interesan" },
  { estado: "postulada", etiqueta: "Postuladas" },
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
