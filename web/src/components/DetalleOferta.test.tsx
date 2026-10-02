import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, test, vi } from "vitest";
import type { Oferta } from "../domain/types";
import { DetalleOferta } from "./DetalleOferta";

const oferta: Oferta = {
  id: 3,
  url: "https://ejemplo.com/3",
  titulo: "Asistente Virtual",
  empresa: "ACME",
  fuente: "Get on Board",
  ubicacion: "Remoto",
  descripcion: "Atención a clientes por mail",
  fecha_publicacion: null,
  encontrada: "2026-09-30",
  puntaje: 70,
  tipo: "soporte",
  motivo: "Calza",
  postular: true,
  estafa: false,
  estado: "me_interesa",
  estado_actualizado: null,
  notas: null,
  carta: null,
  fecha_postulacion: null,
  fecha_entrevista: null,
  mensaje_seguimiento: null,
  mensaje_corto: null,
  archivada: null,
};

function mostrar(datos: Oferta = oferta) {
  const cliente = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  const onCerrar = vi.fn();
  render(
    <QueryClientProvider client={cliente}>
      <DetalleOferta oferta={datos} onCerrar={onCerrar} onCambiarEstado={() => {}} />
    </QueryClientProvider>,
  );
  return { onCerrar };
}

/** Reemplaza fetch por una respuesta fija de la API. */
function apiResponde(cuerpo: unknown) {
  const fetchFalso = vi.fn().mockResolvedValue({ status: 200, json: async () => cuerpo });
  vi.stubGlobal("fetch", fetchFalso);
  return fetchFalso;
}

afterEach(() => vi.unstubAllGlobals());

describe("DetalleOferta", () => {
  test("muestra la descripción y el botón para escribir la carta", () => {
    mostrar();
    expect(screen.getByRole("dialog", { name: "Asistente Virtual" })).toBeInTheDocument();
    expect(screen.getByText("Atención a clientes por mail")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Escribir carta" })).toBeInTheDocument();
  });

  test("'Escribir carta' pide la carta a la API y la muestra para editar", async () => {
    const fetchFalso = apiResponde({ status: "success", payload: { ...oferta, carta: "Hola, soy Deiber" } });
    mostrar();
    await userEvent.click(screen.getByRole("button", { name: "Escribir carta" }));
    expect(await screen.findByRole("textbox", { name: "Carta de presentación" })).toHaveValue("Hola, soy Deiber");
    expect(fetchFalso).toHaveBeenCalledWith("/api/ofertas/3/carta", { method: "POST" });
  });

  test("si la API falla, muestra el motivo", async () => {
    apiResponde({ status: "error", error: "No se pudo escribir la carta: Claude tardó demasiado en responder" });
    mostrar();
    await userEvent.click(screen.getByRole("button", { name: "Escribir carta" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/tardó demasiado/);
  });

  test("con una carta editada avisa que hay cambios sin guardar", async () => {
    mostrar({ ...oferta, carta: "Carta guardada" });
    const cuadro = screen.getByRole("textbox", { name: "Carta de presentación" });
    expect(screen.getByRole("button", { name: "Guardado" })).toBeDisabled();
    await userEvent.type(cuadro, " y editada");
    expect(screen.getByRole("button", { name: "Guardar cambios" })).toBeEnabled();
    expect(screen.getByText("Tenés cambios sin guardar.")).toBeInTheDocument();
  });

  test("'Mensaje corto' muestra la versión para LinkedIn y la pide a su propia ruta", async () => {
    const fetchFalso = apiResponde({ status: "success", payload: { ...oferta, mensaje_corto: "Hola, vi la búsqueda" } });
    mostrar({ ...oferta, carta: "Carta larga" });
    await userEvent.click(screen.getByRole("button", { name: "Mensaje corto" }));
    expect(screen.getByRole("button", { name: "Mensaje corto" })).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(screen.getByRole("button", { name: "Escribir mensaje corto" }));
    expect(fetchFalso).toHaveBeenCalledWith("/api/ofertas/3/mensaje-corto", { method: "POST" });
    expect(await screen.findByRole("textbox", { name: "Mensaje corto para el reclutador" })).toHaveValue("Hola, vi la búsqueda");
    // La carta completa sigue ahí al volver.
    await userEvent.click(screen.getByRole("button", { name: "Carta completa" }));
    expect(screen.getByRole("textbox", { name: "Carta de presentación" })).toHaveValue("Carta larga");
  });

  test("Escape cierra el panel", async () => {
    const { onCerrar } = mostrar();
    await userEvent.keyboard("{Escape}");
    expect(onCerrar).toHaveBeenCalled();
  });
});
