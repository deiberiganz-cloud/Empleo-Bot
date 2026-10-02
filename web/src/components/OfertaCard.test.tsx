import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";
import type { Oferta } from "../domain/types";
import { OfertaCard } from "./OfertaCard";

const oferta: Oferta = {
  id: 7,
  url: "https://ejemplo.com/7",
  titulo: "Soporte Técnico Junior",
  empresa: "ACME",
  fuente: "Get on Board",
  ubicacion: "Remoto",
  descripcion: null,
  fecha_publicacion: null,
  encontrada: "2026-09-30",
  puntaje: 65,
  tipo: "soporte",
  motivo: "Pide lo que ya hiciste en tu pasantía",
  postular: true,
  estafa: false,
  estado: "nueva",
  estado_actualizado: null,
  notas: null,
  carta: null,
  fecha_postulacion: null,
  fecha_entrevista: null,
  mensaje_seguimiento: null,
  mensaje_corto: null,
  archivada: null,
};

describe("OfertaCard", () => {
  test("muestra título, puntaje, motivo y el link a la oferta", () => {
    render(<OfertaCard oferta={oferta} onCambiarEstado={() => {}} onAbrir={() => {}} />);
    expect(screen.getByRole("button", { name: "Soporte Técnico Junior" })).toBeInTheDocument();
    expect(screen.getByText("65")).toBeInTheDocument();
    expect(screen.getByText("Pide lo que ya hiciste en tu pasantía")).toBeInTheDocument();
    expect(screen.getByText("Recomendada")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /ver oferta/i })).toHaveAttribute("href", "https://ejemplo.com/7");
  });

  test("al tocar 'Me interesa' avisa con el id y el estado nuevo", async () => {
    const onCambiarEstado = vi.fn();
    render(<OfertaCard oferta={oferta} onCambiarEstado={onCambiarEstado} onAbrir={() => {}} />);
    await userEvent.click(screen.getByRole("button", { name: "Me interesa" }));
    expect(onCambiarEstado).toHaveBeenCalledWith(7, "me_interesa");
  });

  test("marca las posibles estafas y no las muestra como recomendadas", () => {
    render(<OfertaCard oferta={{ ...oferta, estafa: true }} onCambiarEstado={() => {}} onAbrir={() => {}} />);
    expect(screen.getByText(/posible estafa/i)).toBeInTheDocument();
    expect(screen.queryByText("Recomendada")).not.toBeInTheDocument();
  });

  test("al tocar el título abre el detalle de esa oferta", async () => {
    const onAbrir = vi.fn();
    render(<OfertaCard oferta={oferta} onCambiarEstado={() => {}} onAbrir={onAbrir} />);
    await userEvent.click(screen.getByRole("button", { name: "Soporte Técnico Junior" }));
    expect(onAbrir).toHaveBeenCalledWith(7);
  });
});
