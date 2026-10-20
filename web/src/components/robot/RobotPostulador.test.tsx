import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { EstadoPostulador } from "../../domain/types";
import { RobotPostulador } from "./RobotPostulador";

const trabajando: EstadoPostulador = {
  enCurso: { id: 7, titulo: "Dev Junior", empresa: "ACME", desde: new Date().toISOString() },
  enFila: 2,
  intentosHoy: 1,
  limite: 10,
};

const mostrar = (estado: EstadoPostulador) => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ status: "success", payload: estado }))));
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <RobotPostulador onVerBloqueada={() => {}} />
    </QueryClientProvider>,
  );
};

beforeEach(() => {
  // jsdom no trae matchMedia: un sistema con "menos movimiento" (el robot no camina en los tests).
  vi.stubGlobal("matchMedia", () => ({ matches: true, addEventListener: () => {}, removeEventListener: () => {} }));
});
afterEach(() => vi.unstubAllGlobals());

describe("RobotPostulador", () => {
  test("arranca parado, con todas las poses cargadas y sin bloquear clics", () => {
    const { container } = mostrar({ enCurso: null, enFila: 0, intentosHoy: 0, limite: 10 });
    expect(container.querySelectorAll(".robot__pose")).toHaveLength(11);
    expect(container.querySelector(".robot__pose--activa")).toHaveAttribute("src", "/robot/parado.webp");
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  test("mientras postula, dice a qué empresa y apila las que esperan", async () => {
    const { container } = mostrar(trabajando);
    expect(await screen.findByRole("status")).toHaveTextContent("Postulando a ACME… 0 min");
    expect(container.querySelectorAll(".robot-carril__caja")).toHaveLength(2);
  });
});
