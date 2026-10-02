import { describe, expect, test } from "vitest";
import { accionesPara, contarPorEstado, filtrarOfertas, nivelPuntaje } from "./bandeja";
import type { Oferta } from "./types";

function oferta(cambios: Partial<Oferta> = {}): Oferta {
  return {
    id: 1,
    url: "https://ejemplo.com/1",
    titulo: "Desarrollador Junior",
    empresa: "ACME",
    fuente: "Get on Board",
    ubicacion: "Remoto",
    descripcion: null,
    fecha_publicacion: null,
    encontrada: "2026-09-30",
    puntaje: 70,
    tipo: "dev",
    motivo: "Calza",
    postular: true,
    estafa: false,
    estado: "nueva",
    estado_actualizado: null,
    notas: null,
    carta: null,
    fecha_postulacion: null,
    fecha_entrevista: null,
    mensaje_seguimiento: null,
    archivada: null,
    ...cambios,
  };
}

const ofertas = [
  oferta({ id: 1 }),
  oferta({ id: 2, tipo: "soporte", postular: false, puntaje: 30 }),
  oferta({ id: 3, estafa: true }),
  oferta({ id: 4, estado: "me_interesa", postular: false }),
];

describe("filtrarOfertas", () => {
  test("en Nuevas con 'solo recomendadas' deja solo las que conviene postular y no son estafa", () => {
    const resultado = filtrarOfertas(ofertas, { estado: "nueva", tipo: null, soloRecomendadas: true });
    expect(resultado.map((o) => o.id)).toEqual([1]);
  });

  test("sin 'solo recomendadas' muestra todas las nuevas", () => {
    const resultado = filtrarOfertas(ofertas, { estado: "nueva", tipo: null, soloRecomendadas: false });
    expect(resultado.map((o) => o.id)).toEqual([1, 2, 3]);
  });

  test("filtra por tipo", () => {
    const resultado = filtrarOfertas(ofertas, { estado: "nueva", tipo: "soporte", soloRecomendadas: false });
    expect(resultado.map((o) => o.id)).toEqual([2]);
  });

  test("fuera de Nuevas, 'solo recomendadas' no oculta lo que marcaste", () => {
    const resultado = filtrarOfertas(ofertas, { estado: "me_interesa", tipo: null, soloRecomendadas: true });
    expect(resultado.map((o) => o.id)).toEqual([4]);
  });
});

test("contarPorEstado cuenta cada estado", () => {
  const conteo = contarPorEstado(ofertas);
  expect(conteo.nueva).toBe(3);
  expect(conteo.me_interesa).toBe(1);
  expect(conteo.postulada).toBe(0);
});

test("accionesPara da los botones de cada pestaña", () => {
  expect(accionesPara("nueva").map((a) => a.destino)).toEqual(["descartada", "me_interesa", "postulada"]);
  expect(accionesPara("descartada").map((a) => a.destino)).toEqual(["nueva"]);
  expect(accionesPara("postulada").map((a) => a.destino)).toEqual(["me_interesa", "rechazada", "entrevista"]);
  expect(accionesPara("entrevista").map((a) => a.destino)).toEqual(["postulada", "rechazada", "oferta"]);
});

test("nivelPuntaje separa alto, medio y bajo", () => {
  expect(nivelPuntaje(60)).toBe("alto");
  expect(nivelPuntaje(59)).toBe("medio");
  expect(nivelPuntaje(39)).toBe("bajo");
  expect(nivelPuntaje(null)).toBe("bajo");
});
