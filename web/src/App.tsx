import { useState } from "react";
import { BandejaPage } from "./pages/BandejaPage";
import { SeguimientoPage } from "./pages/SeguimientoPage";

type Vista = "bandeja" | "seguimiento";

const VISTAS: { id: Vista; etiqueta: string }[] = [
  { id: "bandeja", etiqueta: "Bandeja" },
  { id: "seguimiento", etiqueta: "Seguimiento" },
];

/** Encabezado con la marca y el cambio entre Bandeja (decidir) y Seguimiento (lo que está en marcha). */
export function App() {
  const [vista, setVista] = useState<Vista>("bandeja");

  return (
    <div className="pagina">
      <header className="encabezado">
        <h1 className="encabezado__marca">EMPLEO BOT</h1>
        <nav className="encabezado__nav" aria-label="Secciones">
          {VISTAS.map((opcion) => (
            <button
              key={opcion.id}
              type="button"
              className="encabezado__vista"
              aria-pressed={vista === opcion.id}
              onClick={() => setVista(opcion.id)}
            >
              {opcion.etiqueta.toUpperCase()}
            </button>
          ))}
        </nav>
      </header>

      <main className={vista === "seguimiento" ? "contenido contenido--ancho" : "contenido"}>
        {vista === "bandeja" ? <BandejaPage /> : <SeguimientoPage />}
      </main>
    </div>
  );
}
