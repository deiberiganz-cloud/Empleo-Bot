import { describe, expect, test } from "vitest";
import { diasDesde, necesitaSeguimiento, resumirSeguimiento, textoDiasPostulado } from "./seguimiento";
import type { Oferta } from "./types";

const HOY = new Date("2026-10-10T12:00:00Z");
const haceDias = (dias: number) => new Date(HOY.getTime() - dias * 86400000).toISOString();

function oferta(cambios: Partial<Oferta> = {}): Oferta {
  return {
    id: 1,
    url: "https://ejemplo.com/1",
    titulo: "Soporte",
    empresa: "ACME",
    fuente: null,
    ubicacion: null,
    descripcion: null,
    fecha_publicacion: null,
    encontrada: "2026-09-30",
    puntaje: 70,
    tipo: "soporte",
    motivo: null,
    postular: true,
    estafa: false,
    estado: "postulada",
    estado_actualizado: null,
    notas: null,
    carta: null,
    fecha_postulacion: null,
    fecha_entrevista: null,
    mensaje_seguimiento: null,
    mensaje_corto: null,
    archivada: null,
    ...cambios,
  };
}

test("diasDesde cuenta días enteros y da 0 sin fecha", () => {
  expect(diasDesde(haceDias(8), HOY)).toBe(8);
  expect(diasDesde(null, HOY)).toBe(0);
});

describe("necesitaSeguimiento", () => {
  test("avisa a partir de los 7 días en Postulé", () => {
    expect(necesitaSeguimiento(oferta({ fecha_postulacion: haceDias(7) }), HOY)).toBe(true);
    expect(necesitaSeguimiento(oferta({ fecha_postulacion: haceDias(6) }), HOY)).toBe(false);
  });

  test("no avisa si ya pasó a entrevista", () => {
    expect(necesitaSeguimiento(oferta({ estado: "entrevista", fecha_postulacion: haceDias(20) }), HOY)).toBe(false);
  });
});

test("resumirSeguimiento calcula semana, entrevistas y tasa de respuesta", () => {
  const resumen = resumirSeguimiento(
    [
      oferta({ id: 1, fecha_postulacion: haceDias(2) }),
      oferta({ id: 2, fecha_postulacion: haceDias(10), estado: "entrevista" }),
      oferta({ id: 3, fecha_postulacion: haceDias(3), estado: "rechazada" }),
      oferta({ id: 4, fecha_postulacion: haceDias(20) }),
      oferta({ id: 5, estado: "me_interesa" }),
    ],
    HOY,
  );
  expect(resumen.postulacionesSemana).toBe(2);
  expect(resumen.entrevistas).toBe(1);
  expect(resumen.postuladas).toBe(4);
  expect(resumen.respondidas).toBe(2);
  expect(resumen.tasaRespuesta).toBe(50);
});

test("resumirSeguimiento sin postulaciones deja la tasa vacía", () => {
  expect(resumirSeguimiento([oferta({ estado: "nueva" })], HOY).tasaRespuesta).toBeNull();
});

test("textoDiasPostulado habla en singular y plural", () => {
  expect(textoDiasPostulado(oferta({ fecha_postulacion: haceDias(0) }), HOY)).toBe("Postulaste hoy");
  expect(textoDiasPostulado(oferta({ fecha_postulacion: haceDias(1) }), HOY)).toBe("Postulaste hace 1 día");
  expect(textoDiasPostulado(oferta({ fecha_postulacion: haceDias(8) }), HOY)).toBe("Postulaste hace 8 días");
});
