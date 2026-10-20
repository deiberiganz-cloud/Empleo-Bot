import { describe, expect, test } from "vitest";
import { completitud, mover, periodo, PERFIL_VACIO, quitar, reemplazar, tamanoLegible } from "./perfil";
import type { Cv, Perfil } from "./types";

const cv: Cv = { id: 1, nombre: "CV", nombre_original: "cv.pdf", tamano: 1000, predeterminado: true, subido: "2026-10-20" };

describe("completitud", () => {
  test("un perfil vacío está al 0 % y dice todo lo que falta", () => {
    const { porcentaje, faltan } = completitud(PERFIL_VACIO, false, []);
    expect(porcentaje).toBe(0);
    expect(faltan).toContain("CV");
    expect(faltan).toContain("dirección y código postal");
  });

  test("la dirección cuenta solo con calle y código postal juntos", () => {
    const soloCalle: Perfil = { ...PERFIL_VACIO, personales: { ...PERFIL_VACIO.personales, direccion: "Calle 1" } };
    expect(completitud(soloCalle, false, []).faltan).toContain("dirección y código postal");
    const completa: Perfil = { ...soloCalle, personales: { ...soloCalle.personales, codigoPostal: "1000" } };
    expect(completitud(completa, false, []).faltan).not.toContain("dirección y código postal");
  });

  test("foto y CV suman", () => {
    expect(completitud(PERFIL_VACIO, true, [cv]).faltan).not.toContain("CV");
    expect(completitud(PERFIL_VACIO, true, [cv]).porcentaje).toBeGreaterThan(0);
  });
});

describe("listas", () => {
  test("mover cambia de lugar y no se pasa de las puntas", () => {
    expect(mover(["a", "b", "c"], 0, 1)).toEqual(["b", "a", "c"]);
    expect(mover(["a", "b"], 0, -1)).toEqual(["a", "b"]);
    expect(mover(["a", "b"], 1, 1)).toEqual(["a", "b"]);
  });

  test("reemplazar y quitar tocan solo ese ítem", () => {
    expect(reemplazar([{ x: 1 }, { x: 2 }], 1, { x: 9 })).toEqual([{ x: 1 }, { x: 9 }]);
    expect(quitar(["a", "b", "c"], 1)).toEqual(["a", "c"]);
  });
});

describe("textos", () => {
  test("tamanoLegible y periodo", () => {
    expect(tamanoLegible(123 * 1024)).toBe("123 KB");
    expect(tamanoLegible(1.5 * 1024 * 1024)).toBe("1,5 MB");
    expect(periodo({ desde: "2019", hasta: "2024" })).toBe("2019 – 2024");
    expect(periodo({ desde: "2019", hasta: "" })).toBe("2019");
  });
});
