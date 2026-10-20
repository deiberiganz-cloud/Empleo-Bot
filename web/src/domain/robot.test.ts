import { describe, expect, test } from "vitest";
import { finalDePostulacion, textoGlobo } from "./robot";

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
