import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, test, vi } from "vitest";
import { BotonSonido } from "./BotonSonido";

afterEach(() => vi.unstubAllGlobals());

describe("BotonSonido", () => {
  test("arranca apagado, al tocarlo se prende y recuerda la elección; el segundo toque lo apaga", async () => {
    localStorage.clear();
    render(<BotonSonido />);
    const prender = screen.getByRole("button", { name: "Prender el sonido" });
    expect(prender).toHaveAttribute("aria-pressed", "false");

    await userEvent.click(prender);
    const apagar = await screen.findByRole("button", { name: "Apagar el sonido" });
    expect(apagar).toHaveAttribute("aria-pressed", "true");
    expect(localStorage.getItem("empleo-bot-sonido")).toBe("on");

    await userEvent.click(apagar);
    expect(await screen.findByRole("button", { name: "Prender el sonido" })).toHaveAttribute("aria-pressed", "false");
    expect(localStorage.getItem("empleo-bot-sonido")).toBe("off");
  });

  test("si localStorage falla, igual funciona (solo no se recuerda)", async () => {
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("bloqueado");
      },
      setItem: () => {
        throw new Error("bloqueado");
      },
    });
    render(<BotonSonido />);
    await userEvent.click(screen.getByRole("button"));
    expect(await screen.findByRole("button", { name: "Apagar el sonido" })).toBeInTheDocument();
  });
});
