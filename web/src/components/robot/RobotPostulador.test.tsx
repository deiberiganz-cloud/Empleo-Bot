import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { POSES } from "../../domain/robot";
import type { EstadoPostulador } from "../../domain/types";
import { CajasFisicas } from "./cajas";
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
  test("arranca respirando, con los 273 cuadros cargados, las 4 cajas de base y sin bloquear clics", () => {
    const { container } = mostrar({ enCurso: null, enFila: 0, intentosHoy: 0, limite: 10 });
    expect(container.querySelectorAll(".robot__pose")).toHaveLength(POSES.length);
    expect(container.querySelector(".robot__pose--activa")).toHaveAttribute("src", "/robot/respirar-0.webp");
    expect(container.querySelectorAll(".caja-fisica")).toHaveLength(4);
    expect(container.querySelector(".robot-carril__carro")).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  test("mientras postula, dice a qué empresa; las que esperan se suman a las 4 de base", async () => {
    const { container } = mostrar(trabajando);
    expect(await screen.findByRole("status")).toHaveTextContent("Postulando a ACME… 0 min");
    // una por oferta en fila (2) más la que el robot está por recoger (la 3.ª): 4 de base + 3
    await waitFor(() => expect(container.querySelectorAll(".caja-fisica")).toHaveLength(7));
  });

  test("al desmontar quita las cajas y deja el encabezado limpio", async () => {
    const { container, unmount } = mostrar(trabajando);
    await screen.findByRole("status");
    const carril = container.querySelector(".robot-carril") as HTMLElement;
    unmount();
    expect(carril.querySelectorAll(".caja-fisica")).toHaveLength(0);
  });
});

describe("CajasFisicas: selección de texto", () => {
  test("un mousedown sobre una caja no selecciona texto; fuera de las cajas sí se puede", () => {
    const encabezado = document.createElement("header");
    const carril = document.createElement("div");
    encabezado.appendChild(carril);
    document.body.appendChild(encabezado);
    const cajas = new CajasFisicas({ carril, encabezado, alGolpear: () => {}, alAgarrar: () => {}, quieto: () => true, escala: () => 1 });
    // en jsdom getBoundingClientRect es todo ceros: las coordenadas del clic son las locales de la caja
    const { x, y } = cajas.cajas[0].cuerpo.position;
    const clic = (clientX: number, clientY: number) => {
      const e = new MouseEvent("mousedown", { bubbles: true, cancelable: true, clientX, clientY });
      encabezado.dispatchEvent(e);
      return e.defaultPrevented;
    };
    expect(clic(x, y)).toBe(true);
    expect(clic(x + 500, y + 500)).toBe(false);
    cajas.destruir();
    encabezado.remove();
  });
});

describe("CajasFisicas: carro", () => {
  test("la plataforma y la manija quedan donde se dibujan, y la acomodación repetida no las corre", () => {
    const encabezado = document.createElement("header");
    const carril = document.createElement("div");
    Object.defineProperty(carril, "clientWidth", { value: 600 });
    Object.defineProperty(carril, "clientHeight", { value: 100 });
    encabezado.appendChild(carril);
    const cajas = new CajasFisicas({ carril, encabezado, alGolpear: () => {}, alAgarrar: () => {}, quieto: () => true, escala: () => 1 });
    cajas.acomodarParedes();
    const [plataforma, manija] = (cajas as unknown as { carro: { bounds: { min: { x: number; y: number }; max: { x: number; y: number } } }[] }).carro;
    expect(plataforma.bounds.min.x).toBeCloseTo(8);
    expect(plataforma.bounds.max.x).toBeCloseTo(74);
    expect(plataforma.bounds.min.y).toBeCloseTo(87);
    expect(plataforma.bounds.max.y).toBeCloseTo(100);
    expect(manija.bounds.min.x).toBeCloseTo(5);
    expect(manija.bounds.max.x).toBeCloseTo(12);
    expect(manija.bounds.min.y).toBeCloseTo(37);
    cajas.destruir();
  });
});
