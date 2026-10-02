import { expect, test } from "vitest";
import { cuando, textoAvisos, textoProxima, textoUltimaBusqueda } from "./busqueda";
import type { Busqueda } from "./types";

// Fechas en hora local, así los tests no dependen de la zona horaria de la PC.
const AHORA = new Date(2026, 9, 2, 18, 0);
const local = (dia: number, hora: number, minuto = 0) => new Date(2026, 9, dia, hora, minuto).toISOString();

function busqueda(cambios: Partial<Busqueda> = {}): Busqueda {
  return { fecha: local(2, 15, 20), recibidas: 40, nuevas: 8, buenas: 3, errores: [], ...cambios };
}

test("cuando dice hoy, ayer, mañana o la fecha", () => {
  expect(cuando(local(2, 15, 20), AHORA)).toBe("hoy 15:20");
  expect(cuando(local(1, 9, 5), AHORA)).toBe("ayer 09:05");
  expect(cuando(local(3, 3, 20), AHORA)).toBe("mañana 03:20");
  expect(cuando(new Date(2026, 8, 28, 15, 20).toISOString(), AHORA)).toBe("28/09 15:20");
});

test("textoUltimaBusqueda resume cuándo fue y qué encontró", () => {
  expect(textoUltimaBusqueda(busqueda(), AHORA)).toBe("Última búsqueda: hoy 15:20 · 8 nuevas, 3 recomendadas");
  expect(textoUltimaBusqueda(busqueda({ nuevas: 1, buenas: 1 }), AHORA)).toBe(
    "Última búsqueda: hoy 15:20 · 1 nueva, 1 recomendada",
  );
  expect(textoUltimaBusqueda(busqueda({ nuevas: 0, buenas: 0 }), AHORA)).toBe(
    "Última búsqueda: hoy 15:20 · sin ofertas nuevas",
  );
  expect(textoUltimaBusqueda(null, AHORA)).toBe("Todavía no se buscó ninguna vez.");
});

test("textoProxima y textoAvisos", () => {
  expect(textoProxima(local(3, 3, 20), AHORA)).toBe("Próxima: mañana 03:20");
  expect(textoProxima(null, AHORA)).toBe("Busca sola apenas puede.");
  expect(textoAvisos([])).toBeNull();
  expect(textoAvisos(["RemoteOK: respondió 503"])).toBe("1 aviso");
  expect(textoAvisos(["a", "b"])).toBe("2 avisos");
});
