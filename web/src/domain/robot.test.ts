import { describe, expect, test } from "vitest";
import {
  CAJA_ANCHO,
  CAJA_ALTO,
  type CajaMedida,
  cajasExtra,
  columnaCercana,
  columnaMasBaja,
  COLUMNAS,
  estaFueraDeLugar,
  finalDePostulacion,
  inclinacion,
  dentroDelNucleo,
  desfaseDePose,
  ENOJOS_PARA_BERRINCHE,
  enojar,
  MS_RECUPERA_PACIENCIA,
  pacienciaIntacta,
  recuperarPaciencia,
  seAcaboLaPaciencia,
  limitarVelocidad,
  pasoDelCursor,
  POSES,
  SERIES,
  techoColumna,
  textoGlobo,
} from "./robot";

describe("finalDePostulacion", () => {
  test("postulada (o ya más adelante) → entrega la caja", () => {
    expect(finalDePostulacion({ estado: "postulada", bloqueada_motivo: null })).toBe("postulada");
    expect(finalDePostulacion({ estado: "entrevista", bloqueada_motivo: null })).toBe("postulada");
  });

  test("por postular con motivo → bloqueada", () => {
    expect(finalDePostulacion({ estado: "por_postular", bloqueada_motivo: "CAPTCHA" })).toBe("bloqueada");
  });

  test("descartada, sin bloqueo o sin datos → devuelve la caja", () => {
    expect(finalDePostulacion({ estado: "descartada", bloqueada_motivo: null })).toBe("devuelta");
    expect(finalDePostulacion({ estado: "por_postular", bloqueada_motivo: null })).toBe("devuelta");
    expect(finalDePostulacion(null)).toBe("devuelta");
  });
});

describe("textoGlobo", () => {
  test("dice la empresa y los minutos que lleva", () => {
    const desde = "2026-10-20T15:00:00Z";
    expect(textoGlobo("JBK Argentina", desde, new Date("2026-10-20T15:04:30Z"))).toBe("Postulando a JBK Argentina… 4 min");
    expect(textoGlobo(null, desde, new Date("2026-10-20T15:00:10Z"))).toBe("Postulando a la oferta… 0 min");
  });
});

const ALTO = 100;
const piso = (x: number, extra: Partial<CajaMedida> = {}): CajaMedida => ({ x, y: ALTO - CAJA_ALTO / 2, angulo: 0, velocidad: 0, ...extra });

describe("cuadros", () => {
  test("son los 273 del robot v2, sin repetidos", () => {
    expect(POSES).toHaveLength(273);
    expect(new Set(POSES).size).toBe(273);
    expect(SERIES.caminar).toHaveLength(16);
    expect(SERIES.corto[35]).toBe("corto-35");
    expect(SERIES.berrinche).toHaveLength(36);
    expect(SERIES.soltarBorde).toHaveLength(8);
    expect(SERIES.sacudirManos).toHaveLength(16);
  });
});

describe("cajasExtra", () => {
  test("una por oferta que espera, hasta 6 (las 4 de base no cuentan acá)", () => {
    expect(cajasExtra(0)).toBe(0);
    expect(cajasExtra(3)).toBe(3);
    expect(cajasExtra(6)).toBe(6);
    expect(cajasExtra(40)).toBe(6);
    expect(cajasExtra(-2)).toBe(0);
  });
});

describe("columnas", () => {
  test("la columna cercana y la inclinación (boca abajo también es derecha)", () => {
    expect(columnaCercana(10)).toBe(COLUMNAS[0]);
    expect(columnaCercana(60)).toBe(COLUMNAS[1]);
    expect(inclinacion(0)).toBeCloseTo(0);
    expect(inclinacion(Math.PI)).toBeCloseTo(0);
    expect(inclinacion(-0.2)).toBeCloseTo(0.2);
    expect(inclinacion(Math.PI / 2)).toBeCloseTo(Math.PI / 2);
  });

  test("la nueva cae sobre la columna más baja; con empate, la de la derecha", () => {
    const base = [piso(COLUMNAS[0]), piso(COLUMNAS[0], { y: ALTO - CAJA_ALTO * 1.5 }), piso(COLUMNAS[1])];
    expect(techoColumna(COLUMNAS[0], base, ALTO)).toBe(ALTO - CAJA_ALTO * 2);
    expect(techoColumna(COLUMNAS[1], base, ALTO)).toBe(ALTO - CAJA_ALTO);
    expect(columnaMasBaja(base, ALTO)).toBe(COLUMNAS[1]);
    expect(columnaMasBaja([piso(COLUMNAS[0]), piso(COLUMNAS[1])], ALTO)).toBe(COLUMNAS[1]);
    expect(columnaMasBaja([], ALTO)).toBe(COLUMNAS[1]);
  });
});

describe("estaFueraDeLugar", () => {
  test("en su columna, derecha y apoyada → en orden (aunque derive hasta 10 px)", () => {
    const caja = piso(COLUMNAS[0] + 10);
    expect(estaFueraDeLugar(caja, [caja], ALTO)).toBe(false);
  });

  test("a más de 10 px de la columna → desordenada", () => {
    const caja = piso(COLUMNAS[0] + 11);
    expect(estaFueraDeLugar(caja, [caja], ALTO)).toBe(true);
  });

  test("inclinada más de 0.35 rad → desordenada", () => {
    expect(estaFueraDeLugar(piso(COLUMNAS[0], { angulo: 0.36 }), [], ALTO)).toBe(true);
    expect(estaFueraDeLugar(piso(COLUMNAS[0], { angulo: 0.3 }), [], ALTO)).toBe(false);
  });

  test("flotando sin apoyo → desordenada; encima de otra caja de su columna → en orden", () => {
    const abajo = piso(COLUMNAS[0]);
    const flotando: CajaMedida = { x: COLUMNAS[0], y: 20, angulo: 0, velocidad: 0 };
    const encima: CajaMedida = { x: COLUMNAS[0], y: abajo.y - CAJA_ALTO, angulo: 0, velocidad: 0 };
    expect(estaFueraDeLugar(flotando, [abajo, flotando], ALTO)).toBe(true);
    expect(estaFueraDeLugar(encima, [abajo, encima], ALTO)).toBe(false);
  });

  test("agarrada o todavía en movimiento no cuenta", () => {
    expect(estaFueraDeLugar(piso(90), [], ALTO, true)).toBe(false);
    expect(estaFueraDeLugar(piso(90, { velocidad: 1 }), [], ALTO)).toBe(false);
  });
});

describe("pasoDelCursor", () => {
  test("llega directo si está cerca", () => {
    expect(pasoDelCursor({ x: 10, y: 10 }, { x: 13, y: 6 }, 20)).toEqual({ x: 3, y: -4 });
  });

  test("no pasa del máximo y conserva la dirección", () => {
    const p = pasoDelCursor({ x: 0, y: 0 }, { x: 300, y: 400 }, 20);
    expect(p.x).toBeCloseTo(12);
    expect(p.y).toBeCloseTo(16);
  });
});

describe("limitarVelocidad", () => {
  test("no toca lo que ya está dentro del tope", () => {
    expect(limitarVelocidad({ x: 1, y: 2 }, 4)).toEqual({ x: 1, y: 2 });
  });

  test("recorta al tope conservando la dirección", () => {
    const v = limitarVelocidad({ x: 30, y: 40 }, 5);
    expect(v.x).toBeCloseTo(3);
    expect(v.y).toBeCloseTo(4);
  });
});

describe("dentroDelNucleo", () => {
  const centro = { x: 100, y: 50 };

  test("el centro cuenta; el borde (a menos del margen) no", () => {
    expect(dentroDelNucleo(centro, centro, 0)).toBe(true);
    expect(dentroDelNucleo({ x: 100 + CAJA_ANCHO / 2 - 2, y: 50 }, centro, 0)).toBe(false);
    expect(dentroDelNucleo({ x: 100, y: 50 + CAJA_ALTO / 2 - 2 }, centro, 0)).toBe(false);
  });

  test("sigue los ejes de la caja girada", () => {
    const punto = { x: 100, y: 50 + 8 }; // 8 px abajo: dentro del ancho, pero fuera del alto si no está girada
    expect(dentroDelNucleo(punto, centro, 0)).toBe(false);
    expect(dentroDelNucleo(punto, centro, Math.PI / 2)).toBe(true);
  });
});

describe("paciencia del robot", () => {
  test("cada enojo suma uno y reinicia la cuenta de la recuperación", () => {
    const p = enojar(enojar(pacienciaIntacta(0), 1000), 5000);
    expect(p).toEqual({ enojos: 2, desde: 5000 });
  });

  test("revienta recién al llegar al tope", () => {
    let p = pacienciaIntacta(0);
    for (let i = 1; i < ENOJOS_PARA_BERRINCHE; i++) {
      p = enojar(p, i);
      expect(seAcaboLaPaciencia(p)).toBe(false);
    }
    expect(seAcaboLaPaciencia(enojar(p, 99))).toBe(true);
  });

  test("sin enojos por 30 s recupera un punto, y de a uno", () => {
    const p = { enojos: 3, desde: 1000 };
    expect(recuperarPaciencia(p, 1000 + MS_RECUPERA_PACIENCIA - 1)).toBe(p);
    const uno = recuperarPaciencia(p, 1000 + MS_RECUPERA_PACIENCIA);
    expect(uno).toEqual({ enojos: 2, desde: 1000 + MS_RECUPERA_PACIENCIA });
    expect(recuperarPaciencia(uno, uno.desde + 1000)).toBe(uno); // el siguiente espera otros 30 s
  });

  test("con la paciencia llena no hay nada que recuperar", () => {
    const p = pacienciaIntacta(0);
    expect(recuperarPaciencia(p, 10 * MS_RECUPERA_PACIENCIA)).toBe(p);
  });
});

describe("desfaseDePose", () => {
  test("solo el berrinche y soltar-borde traen el cuerpo corrido", () => {
    expect(desfaseDePose("berrinche-0")).toBe(0);
    expect(desfaseDePose("berrinche-6")).toBe(24);
    expect(desfaseDePose("berrinche-35")).toBe(10);
    expect(desfaseDePose("soltar-borde-0")).toBe(10);
    expect(desfaseDePose("soltar-borde-7")).toBe(0);
    expect(desfaseDePose("respirar-3")).toBe(0);
    expect(desfaseDePose("salto")).toBe(0);
  });
});
