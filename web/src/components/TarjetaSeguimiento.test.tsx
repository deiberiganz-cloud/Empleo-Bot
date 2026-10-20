import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";
import type { Oferta } from "../domain/types";
import { TarjetaSeguimiento } from "./TarjetaSeguimiento";

const oferta: Oferta = {
  id: 9,
  url: "https://ejemplo.com/9",
  titulo: "Soporte Técnico Junior",
  empresa: "ACME",
  fuente: null,
  ubicacion: null,
  descripcion: null,
  fecha_publicacion: null,
  encontrada: "2026-09-30",
  puntaje: 65,
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
};

describe("TarjetaSeguimiento: postulador", () => {
  test("la que está en curso dice 'Postulando…'", () => {
    render(<TarjetaSeguimiento oferta={oferta} onCambiarEstado={() => {}} onAbrir={() => {}} postulacion="en_curso" />);
    expect(screen.getByRole("status")).toHaveTextContent("Postulando…");
  });

  test("las que esperan dicen 'En fila'", () => {
    render(<TarjetaSeguimiento oferta={oferta} onCambiarEstado={() => {}} onAbrir={() => {}} postulacion="en_fila" />);
    expect(screen.getByText("En fila")).toBeInTheDocument();
  });

  test("la bloqueada muestra el motivo y 'Reintentar' avisa con el id", async () => {
    const onReintentar = vi.fn();
    render(
      <TarjetaSeguimiento
        oferta={{ ...oferta, bloqueada_motivo: "Apareció un CAPTCHA" }}
        onCambiarEstado={() => {}}
        onAbrir={() => {}}
        postulacion="bloqueada"
        onReintentar={onReintentar}
      />,
    );
    expect(screen.getByText(/Apareció un CAPTCHA/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(onReintentar).toHaveBeenCalledWith(9);
    // Los botones manuales siguen ahí.
    expect(screen.getByRole("button", { name: "Postulé" })).toBeInTheDocument();
  });

  test("sin postulador no muestra nada extra", () => {
    render(<TarjetaSeguimiento oferta={{ ...oferta, estado: "me_interesa" }} onCambiarEstado={() => {}} onAbrir={() => {}} />);
    expect(screen.queryByText("En fila")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Reintentar" })).not.toBeInTheDocument();
  });
});
