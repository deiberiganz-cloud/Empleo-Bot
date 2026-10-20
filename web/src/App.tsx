import { useState } from "react";
import { BotonTema } from "./components/BotonTema";
import { ArchivoPage } from "./pages/ArchivoPage";
import { BandejaPage } from "./pages/BandejaPage";
import { PerfilPage } from "./pages/PerfilPage";
import { SeguimientoPage } from "./pages/SeguimientoPage";

type Vista = "bandeja" | "seguimiento" | "archivo" | "perfil";

const VISTAS: { id: Vista; etiqueta: string }[] = [
  { id: "bandeja", etiqueta: "Bandeja" },
  { id: "seguimiento", etiqueta: "Seguimiento" },
  { id: "archivo", etiqueta: "Archivo" },
  { id: "perfil", etiqueta: "Perfil" },
];

const PAGINAS: Record<Vista, () => React.JSX.Element> = {
  bandeja: BandejaPage,
  seguimiento: SeguimientoPage,
  archivo: ArchivoPage,
  perfil: PerfilPage,
};

/** Encabezado con la marca y el cambio entre Bandeja (decidir), Seguimiento (en marcha), Archivo (terminado) y Perfil (tus datos). */
export function App() {
  const [vista, setVista] = useState<Vista>("bandeja");
  const Pagina = PAGINAS[vista];

  return (
    <div className="pagina">
      <header className="encabezado">
        <h1 className="encabezado__marca">EMPLEO BOT</h1>
        <BotonTema />
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

      <main className={vista === "bandeja" || vista === "perfil" ? "contenido" : "contenido contenido--ancho"}>
        <Pagina />
      </main>
    </div>
  );
}
