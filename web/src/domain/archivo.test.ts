import { describe, expect, it } from "vitest";
import { fechaBorrado, ordenarArchivo, tilesHistorial } from "./archivo";
import type { Oferta } from "./types";

const oferta = (id: number, archivada: string | null) => ({ id, archivada }) as Oferta;

describe("archivo", () => {
  it("la fecha de borrado es 30 días después de archivada", () => {
    expect(fechaBorrado(oferta(1, "2026-10-01T15:00:00Z"))).toBe("31/10");
    expect(fechaBorrado(oferta(1, null))).toBeNull();
  });

  it("ordena de lo último archivado a lo más viejo", () => {
    const ordenadas = ordenarArchivo([oferta(1, "2026-10-01"), oferta(2, "2026-10-05"), oferta(3, "2026-09-20")]);
    expect(ordenadas.map((o) => o.id)).toEqual([2, 1, 3]);
  });

  it("los totales del historial ponen 0 en lo que todavía no pasó", () => {
    const tiles = tilesHistorial({ postuladas: 4, porEstado: { rechazada: 2, descartada: 9 } });
    expect(tiles.map((t) => t.valor)).toEqual([4, 0, 0, 2]);
  });
});
