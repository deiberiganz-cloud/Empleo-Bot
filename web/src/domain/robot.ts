import type { Oferta } from "./types";

/**
 * Los cuadros del robot: 273 imágenes del modelo 3D renderizadas en Blender (archivos en web/public/robot/,
 * generados con blender/animar-robot.py y blender/sprites-a-webp.py). Todas miran a la derecha:
 * para ir a la izquierda el cuerpo se espeja con CSS.
 */
type Cuadro<N extends string> = `${N}-${number}`;
export type Pose = "salto" | Cuadro<
  | "respirar" | "recoger" | "caminar" | "caja" | "pensar" | "entregar" | "corto" | "preocupado"
  | "golpe" | "golpe-caja" | "molesto" | "molesto-caja" | "sacar-flauta" | "flauta"
  | "berrinche" | "soltar-borde" | "sacudir-manos"
>;

function cuadros<N extends string>(nombre: N, cantidad: number): Cuadro<N>[] {
  return Array.from({ length: cantidad }, (_, i) => `${nombre}-${i}` as Cuadro<N>);
}

/** Las series de cuadros (cada una es una animación). `caja` = caminar con la caja; `-caja` = con la caja en las manos. */
export const SERIES = {
  respirar: cuadros("respirar", 16),
  recoger: cuadros("recoger", 8),
  caminar: cuadros("caminar", 16),
  caja: cuadros("caja", 16),
  pensar: cuadros("pensar", 24),
  entregar: cuadros("entregar", 6),
  salto: ["salto"] as Pose[],
  corto: cuadros("corto", 36),
  preocupado: cuadros("preocupado", 10),
  golpe: cuadros("golpe", 12),
  golpeCaja: cuadros("golpe-caja", 12),
  molesto: cuadros("molesto", 16),
  molestoCaja: cuadros("molesto-caja", 16),
  sacarFlauta: cuadros("sacar-flauta", 8),
  flauta: cuadros("flauta", 16),
  berrinche: cuadros("berrinche", 36),
  soltarBorde: cuadros("soltar-borde", 8),
  sacudirManos: cuadros("sacudir-manos", 16),
} satisfies Record<string, Pose[]>;

export const POSES: Pose[] = Object.values(SERIES).flat();

/**
 * Los cuadros del berrinche y de soltar-borde traen el cuerpo corrido a la derecha: estos son los píxeles de la imagen
 * (de 360 de alto) que se le restan para que los pies no salten de un cuadro a otro.
 */
const DESFASE_BERRINCHE = [0, 5, 10, 16, 17, 22, 24, 24, 24, 24, 24, 24, 24, 12, 13, 12, ...Array<number>(20).fill(10)];
const DESFASE_SOLTAR = [10, 14, 16, 16, 12, 6, 2, 0];
const DESFASES = new Map<Pose, number>([
  ...SERIES.berrinche.map((p, i) => [p, DESFASE_BERRINCHE[i]] as const),
  ...SERIES.soltarBorde.map((p, i) => [p, DESFASE_SOLTAR[i]] as const),
]);

/** Cuánto hay que correr el robot hacia la izquierda (en px de una imagen de 360 de alto) para que esta pose apoye los pies donde debe. */
export function desfaseDePose(pose: Pose): number {
  return DESFASES.get(pose) ?? 0;
}

// ---- Movimiento ----
/** Cuánto avanza el robot (a 90 px de alto) en un ciclo de 16 cuadros: así los pies no patinan. */
export const PX_POR_CICLO = 46;
export const ALTO_BASE = 90;
export const VELOCIDAD = 75; // px por segundo
export const CASA = 108; // la esquina izquierda donde descansa (el robot en reposo no se monta sobre el carro, que termina en x≈74)
export const ANTES_DEL_BORDE = 92; // dónde entrega la caja, contado desde la derecha
export const MS_BLOQUEADO = 6000; // cuánto espera con el "!" antes de volver (si no lo tocan antes)
export const ESPERA_ORDENAR = 8000; // sin tocar las cajas por este tiempo, las ordena solo
export const ESPERA_ORDENAR_CON_FLAUTA = 2000; // si está tocando la flauta reacciona antes: la corta y va a ordenar
export const ESPERA_FLAUTA = 5000; // descansando por este tiempo, saca la flauta
export const VELOCIDAD_GOLPE = 5; // una caja que llega más rápido que esto contra el robot lo golpea

// ---- El berrinche ----
/** Cada enojo gasta paciencia; al llegar a este número el robot revienta. */
export const ENOJOS_PARA_BERRINCHE = 10;
export const MS_RECUPERA_PACIENCIA = 30000; // sin enojos por este tiempo, la paciencia sube de a uno
export const INCLINACION_GRADOS = 5; // la página gira hacia la izquierda
export const MS_INCLINADA = 4000; // y se queda así este tiempo
export const MS_TEMBLOR = 400; // antes de inclinarse, la tierra tiembla
export const GRAVEDAD_INCLINADA_X = -0.7; // mucho más que sin(5°): así de verdad se deslizan
export const FRICCION_INCLINADA = 0;
export const ROCE_AIRE_INCLINADA = 0.008;

// ---- Las cajas ----
/** Dos columnas sobre el carro (forma ":."). Las de base siempre quedan; las ofertas caen sobre la más baja. */
export const COLUMNAS = [28, 55];
/** El carro plataforma donde se guardan las cajas (px desde el borde izquierdo del carril y desde el piso). */
export const PLATAFORMA_ALTO = 13; // la cubierta llega hasta esta altura sobre el piso
export const PLATAFORMA_X = 8;
export const PLATAFORMA_ANCHO = 66;
export const MANIJA_X = 5;
export const MANIJA_ANCHO = 7;
export const MANIJA_ALTO = 63; // altura del puño sobre el piso
export const CAJA_ANCHO = 26;
export const CAJA_ALTO = 20;
export const CAJAS_BASE = 4;
export const CAJAS_EXTRA_MAXIMO = 6;

// ---- El cursor que empuja ----
export const CURSOR_PASO_MAXIMO = 20; // lo más que avanza por cuadro (más que eso saltaría por encima de las cajas)
export const CURSOR_VELOCIDAD_EMPUJE = 0.5; // por debajo de esta velocidad el cursor solo roza: no cuenta como empujar
export const CURSOR_VELOCIDAD_MAXIMA = 4; // tope de la velocidad (px por cuadro) que el cursor le transmite a una caja: corre y tumba, no lanza
export const CURSOR_ACOPLE = 0.5; // qué fracción de la diferencia de velocidad se corrige por cuadro (más alto = empuja más seco)
export const NUCLEO_MARGEN = 5; // px desde el borde de la caja donde el puntero entra sin empujar (así se puede agarrar)
export const CATEGORIA_CAJA = 0x0001; // categorías de choque de Matter: el arrastre solo agarra cajas
export const CATEGORIA_ROBOT = 0x0004;
export const CATEGORIA_PARED = 0x0008;

// ---- Cómo se sienten las cajas ----
export const CAJA_DENSIDAD = 0.008; // pesadas: más de 2 veces la densidad original (0,003)
export const CAJA_ROCE_AIRE = 0.025; // frena las cajas lanzadas para que no floten
export const ARRASTRE_RIGIDEZ = 0.25; // qué tan firme sigue la caja al mouse (bajo = elástico)
export const ARRASTRE_AMORTIGUACION = 0.2;

const MARGEN_COLUMNA = 10; // px de deriva que se perdonan respecto de la columna
const INCLINACION_MAXIMA = 0.35; // rad
const VELOCIDAD_QUIETA = 0.6; // una caja que se mueve más rápido todavía no cuenta como "quieta"
const MARGEN_PISO = 8;

/** Cuánto debe moverse el cursor este cuadro para llegar a `hasta`, sin pasar de `maximo` píxeles. */
export function pasoDelCursor(desde: { x: number; y: number }, hasta: { x: number; y: number }, maximo: number): { x: number; y: number } {
  const dx = hasta.x - desde.x;
  const dy = hasta.y - desde.y;
  const largo = Math.hypot(dx, dy);
  if (largo <= maximo) return { x: dx, y: dy };
  return { x: (dx / largo) * maximo, y: (dy / largo) * maximo };
}

/** Limita un vector de velocidad a un largo máximo, sin cambiarle la dirección. */
export function limitarVelocidad(v: { x: number; y: number }, maximo: number): { x: number; y: number } {
  const largo = Math.hypot(v.x, v.y);
  return largo <= maximo ? v : { x: (v.x / largo) * maximo, y: (v.y / largo) * maximo };
}

/** ¿Está el punto bien adentro de la caja (a más de `margen` de todos sus bordes)? Se mira en los ejes de la caja, que puede estar girada. */
export function dentroDelNucleo(punto: { x: number; y: number }, centro: { x: number; y: number }, angulo: number, margen = NUCLEO_MARGEN): boolean {
  const dx = punto.x - centro.x;
  const dy = punto.y - centro.y;
  const c = Math.cos(angulo);
  const s = Math.sin(angulo);
  const local = { x: dx * c + dy * s, y: -dx * s + dy * c };
  return Math.abs(local.x) <= CAJA_ANCHO / 2 - margen && Math.abs(local.y) <= CAJA_ALTO / 2 - margen;
}

/** Cuántas cajas extra (además de las 4 de base) se muestran: una por oferta que espera, hasta 6. */
export function cajasExtra(enFila: number): number {
  return Math.min(CAJAS_EXTRA_MAXIMO, Math.max(0, Math.floor(enFila)));
}

/** Lo que importa de una caja para juzgar si está en su lugar. */
export interface CajaMedida {
  x: number;
  y: number;
  /** Ángulo en radianes. */
  angulo: number;
  velocidad: number;
}

/** La columna más cercana a una posición horizontal. */
export function columnaCercana(x: number): number {
  return COLUMNAS.reduce((mejor, col) => (Math.abs(x - col) < Math.abs(x - mejor) ? col : mejor), COLUMNAS[0]);
}

/** Ángulo respecto de "derecha" (0 a π/2): una caja boca abajo también cuenta como derecha. */
export function inclinacion(angulo: number): number {
  const a = ((angulo % Math.PI) + Math.PI) % Math.PI;
  return Math.min(a, Math.PI - a);
}

/** La altura (y) de la cubierta del carro, donde se apoya la base de las columnas. */
export function pisoColumnas(altoCarril: number): number {
  return altoCarril - PLATAFORMA_ALTO;
}

/** El techo de una columna: lo más alto de cualquier caja que se meta en su ancho (así la nueva nunca nace encimada). */
export function techoColumna(columna: number, cajas: CajaMedida[], altoCarril: number): number {
  const enColumna = cajas.filter((c) => Math.abs(c.x - columna) < CAJA_ANCHO);
  return enColumna.length ? Math.min(...enColumna.map((c) => c.y - CAJA_ALTO / 2)) : pisoColumnas(altoCarril);
}

/** La columna con el techo más bajo (empate: la de la derecha, la de la caja sola). */
export function columnaMasBaja(cajas: CajaMedida[], altoCarril: number): number {
  const [izquierda, derecha] = COLUMNAS;
  return techoColumna(derecha, cajas, altoCarril) >= techoColumna(izquierda, cajas, altoCarril) ? derecha : izquierda;
}

/** Apoyada = su base está sobre la cubierta del carro (no más abajo: eso sería el suelo) o encima de otra caja de su misma columna. */
export function estaApoyada(caja: CajaMedida, otras: CajaMedida[], altoCarril: number): boolean {
  const base = caja.y + CAJA_ALTO / 2;
  const piso = pisoColumnas(altoCarril);
  if (base > piso - MARGEN_PISO && base < piso + MARGEN_PISO) return true;
  return otras.some((o) => o !== caja && Math.abs(o.x - caja.x) < CAJA_ANCHO * 0.7 && Math.abs(o.y - caja.y - CAJA_ALTO) < MARGEN_PISO);
}

/**
 * Fuera de lugar: quieta y a más de 10 px de su columna, inclinada (> 0.35 rad) o sin apoyo en el carro ni en otra caja.
 * Se juzga por la posición, no por quién la tocó. Una caja que alguien está sosteniendo o que todavía se mueve no cuenta.
 */
export function estaFueraDeLugar(caja: CajaMedida, todas: CajaMedida[], altoCarril: number, agarrada = false): boolean {
  if (agarrada || caja.velocidad >= VELOCIDAD_QUIETA) return false;
  return (
    Math.abs(caja.x - columnaCercana(caja.x)) > MARGEN_COLUMNA ||
    inclinacion(caja.angulo) > INCLINACION_MAXIMA ||
    !estaApoyada(caja, todas, altoCarril)
  );
}

/** La paciencia del robot: enojos acumulados y cuándo fue el último cambio (ms). */
export interface Paciencia {
  enojos: number;
  desde: number;
}

export const pacienciaIntacta = (ahora: number): Paciencia => ({ enojos: 0, desde: ahora });

/** Un enojo más. */
export function enojar(p: Paciencia, ahora: number): Paciencia {
  return { enojos: p.enojos + 1, desde: ahora };
}

/** Sin enojos por `MS_RECUPERA_PACIENCIA`, vuelve un punto de paciencia (y vuelve a contar desde ahí). */
export function recuperarPaciencia(p: Paciencia, ahora: number): Paciencia {
  return p.enojos > 0 && ahora - p.desde >= MS_RECUPERA_PACIENCIA ? { enojos: p.enojos - 1, desde: ahora } : p;
}

/** ¿Se le acabó la paciencia? Entonces hace berrinche. */
export function seAcaboLaPaciencia(p: Paciencia): boolean {
  return p.enojos >= ENOJOS_PARA_BERRINCHE;
}

/** Cómo termina la escena: entrega la caja y salta, se quema con el "!", o vuelve con la caja. */
export type FinalRobot = "postulada" | "bloqueada" | "devuelta";

const YA_POSTULADA: Oferta["estado"][] = ["postulada", "entrevista", "oferta", "rechazada"];

/**
 * Cómo terminó una postulación, mirando la oferta después de que el postulador la soltó.
 * Si sigue en "Por postular" sin bloqueo (por ejemplo, se reinició la app), el robot la devuelve a la fila.
 */
export function finalDePostulacion(oferta: Pick<Oferta, "estado" | "bloqueada_motivo"> | null): FinalRobot {
  if (!oferta) return "devuelta";
  if (YA_POSTULADA.includes(oferta.estado)) return "postulada";
  if (oferta.estado === "por_postular" && oferta.bloqueada_motivo) return "bloqueada";
  return "devuelta";
}

/** El globito sobre el robot: "Postulando a JBK Argentina… 4 min". */
export function textoGlobo(empresa: string | null, desde: string, ahora: Date): string {
  const minutos = Math.max(0, Math.floor((ahora.getTime() - new Date(desde).getTime()) / 60000));
  return `Postulando a ${empresa || "la oferta"}… ${minutos} min`;
}
