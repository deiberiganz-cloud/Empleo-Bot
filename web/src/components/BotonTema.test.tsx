import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { BotonTema } from "./BotonTema";

// jsdom no trae matchMedia: simulamos un sistema en modo claro.
beforeEach(() => {
  vi.stubGlobal("matchMedia", (consulta: string) => ({
    matches: false,
    media: consulta,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
  document.documentElement.setAttribute("data-theme", "light");
  localStorage.clear();
});

afterEach(() => vi.unstubAllGlobals());

describe("BotonTema", () => {
  test("en claro ofrece pasar a oscuro, y al tocarlo cambia el tema y lo recuerda", async () => {
    render(<BotonTema />);
    await userEvent.click(screen.getByRole("button", { name: "Cambiar a modo oscuro" }));
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    expect(localStorage.getItem("empleo-bot-tema")).toBe("dark");
    expect(await screen.findByRole("button", { name: "Cambiar a modo claro" })).toBeInTheDocument();
  });

  test("vuelve a claro con el segundo toque", async () => {
    document.documentElement.setAttribute("data-theme", "dark");
    render(<BotonTema />);
    await userEvent.click(screen.getByRole("button", { name: "Cambiar a modo claro" }));
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
    expect(localStorage.getItem("empleo-bot-tema")).toBe("light");
  });
});
