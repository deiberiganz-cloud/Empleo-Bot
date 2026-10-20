import { describe, expect, test } from "vitest";
import { accionesPara } from "./bandeja";
import { estadoPostulacion, postuladorActivo, textoIntentos } from "./postulador";
import type { EstadoPostulador, Oferta } from "./types";

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
    estado: "por_postular",
    estado_actualizado: null,
    notas: null,
    carta: null,
    fecha_postulacion: null,
    fecha_entrevista: null,
    mensaje_seguimiento: null,
    mensaje_corto: null,
    archivada: null,
    bloqueada_motivo: null,
    ...cambios,
  };
}

const reposo: EstadoPostulador = { enCurso: null, enFila: 0, intentosHoy: 0, limite: 10 };
const trabajando: EstadoPostulador = {
  enCurso: { id: 1, titulo: "Soporte", empresa: "ACME", desde: "2026-10-18T10:00:00Z" },
  enFila: 2,
  intentosHoy: 3,
  limite: 10,
};

describe("estadoPostulacion", () => {
  test("la que está en curso, la que espera y la bloqueada", () => {
    expect(estadoPostulacion(oferta(), trabajando)).toBe("en_curso");
    expect(estadoPostulacion(oferta({ id: 2 }), trabajando)).toBe("en_fila");
    expect(estadoPostulacion(oferta(), undefined)).toBe("en_fila");
    expect(estadoPostulacion(oferta({ bloqueada_motivo: "CAPTCHA" }), trabajando)).toBe("bloqueada");
  });

  test("fuera de 'Por postular' no aplica", () => {
    expect(estadoPostulacion(oferta({ estado: "postulada" }), trabajando)).toBeNull();
    expect(estadoPostulacion(oferta({ estado: "me_interesa", bloqueada_motivo: "CAPTCHA" }), trabajando)).toBeNull();
  });

  test("una bloqueada sigue ofreciendo los botones manuales de 'Por postular' (volver o marcar 'Postulé')", () => {
    expect(accionesPara("por_postular").map((a) => a.destino)).toEqual(["me_interesa", "postulada"]);
  });
});

test("postuladorActivo es true si está trabajando o hay fila", () => {
  expect(postuladorActivo(trabajando)).toBe(true);
  expect(postuladorActivo({ ...reposo, enFila: 1 })).toBe(true);
  expect(postuladorActivo(reposo)).toBe(false);
  expect(postuladorActivo(undefined)).toBe(false);
});

test("textoIntentos cuenta los intentos del día", () => {
  expect(textoIntentos(trabajando)).toBe("Hoy: 3 de 10 intentos");
});
