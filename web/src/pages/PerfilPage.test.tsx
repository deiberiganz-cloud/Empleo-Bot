import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, test, vi } from "vitest";
import { PERFIL_VACIO } from "../domain/perfil";
import type { RespuestaPerfil } from "../domain/types";
import { PerfilPage } from "./PerfilPage";

const respuesta = (cambios: Partial<RespuestaPerfil> = {}): RespuestaPerfil => ({
  datos: { ...PERFIL_VACIO, personales: { ...PERFIL_VACIO.personales, nombre: "Ana Pérez" } },
  tieneFoto: false,
  actualizado: null,
  cvs: [],
  ...cambios,
});

/** Un fetch de mentira: GET devuelve el perfil; PUT devuelve lo que se mandó. */
function simularApi(inicial: RespuestaPerfil) {
  const fetchFalso = vi.fn(async (_url: string, opciones?: RequestInit) => {
    const payload = opciones?.method === "PUT" ? { ...inicial, datos: JSON.parse(String(opciones.body)) } : inicial;
    return new Response(JSON.stringify({ status: "success", payload }));
  });
  vi.stubGlobal("fetch", fetchFalso);
  return fetchFalso;
}

const mostrar = () =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <PerfilPage />
    </QueryClientProvider>,
  );

afterEach(() => vi.unstubAllGlobals());

describe("PerfilPage", () => {
  test("muestra el nombre, las 8 secciones y avisa que falta el CV", async () => {
    simularApi(respuesta());
    mostrar();
    expect(await screen.findByRole("heading", { name: "Ana Pérez" })).toBeInTheDocument();
    for (const titulo of ["Datos personales", "Links", "Currículum (CV)", "Resumen y habilidades", "Experiencia y estudios", "Idiomas", "Qué busco", "Respuestas frecuentes"]) {
      expect(screen.getByRole("heading", { name: new RegExp(titulo.replace(/[()]/g, "\\$&")) })).toBeInTheDocument();
    }
    expect(screen.getByText(/sin CV no se puede postular/)).toBeInTheDocument();
  });

  test("Guardar cambios se habilita al editar y manda el perfil entero", async () => {
    const fetchFalso = simularApi(respuesta());
    mostrar();
    const [guardar] = await screen.findAllByRole("button", { name: "Guardar cambios" });
    expect(guardar).toBeDisabled();

    await userEvent.type(screen.getByLabelText("Código postal"), "1094");
    expect(screen.getByText("Tienes cambios sin guardar.")).toBeInTheDocument();
    await userEvent.click(screen.getAllByRole("button", { name: "Guardar cambios" })[0]);

    await waitFor(() => expect(screen.getByText("Guardado ✓")).toBeInTheDocument());
    const put = fetchFalso.mock.calls.find(([, opciones]) => opciones?.method === "PUT");
    expect(JSON.parse(String(put?.[1]?.body)).personales.codigoPostal).toBe("1094");
  });

  test("agrega una habilidad con Enter y la puede quitar", async () => {
    simularApi(respuesta());
    mostrar();
    await userEvent.type(await screen.findByLabelText("Nueva habilidad"), "Excel{Enter}");
    expect(screen.getByRole("list", { name: "Habilidades" })).toHaveTextContent("Excel");
    await userEvent.click(screen.getByRole("button", { name: "Quitar Excel" }));
    expect(screen.getByRole("list", { name: "Habilidades" })).not.toHaveTextContent("Excel");
  });

  test("con un CV, muestra cuál es el predeterminado", async () => {
    simularApi(respuesta({ cvs: [{ id: 3, nombre: "CV Dev", nombre_original: "cv.pdf", tamano: 2048, predeterminado: true, subido: "2026-10-17T12:00:00Z" }] }));
    mostrar();
    expect(await screen.findByText("Predeterminado")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Ver" })).toHaveAttribute("href", "/api/perfil/cvs/3");
  });
});
