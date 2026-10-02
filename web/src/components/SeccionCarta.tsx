import { useState } from "react";
import type { Oferta } from "../domain/types";
import { useCarta, type VersionCarta } from "../hooks/useCarta";

const TEXTOS: Record<VersionCarta, { pestana: string; etiqueta: string; boton: string; espera: string; ayuda: string }> = {
  completa: {
    pestana: "Carta completa",
    etiqueta: "Carta de presentación",
    boton: "Escribir carta",
    espera: "Claude está escribiendo tu carta… (unos 20 segundos)",
    ayuda: "Para los formularios que piden carta. Claude la escribe con tu perfil y lo que pide esta oferta, sin inventar nada.",
  },
  corta: {
    pestana: "Mensaje corto",
    etiqueta: "Mensaje corto para el reclutador",
    boton: "Escribir mensaje corto",
    espera: "Claude está escribiendo el mensaje… (unos 15 segundos)",
    ayuda: "Para escribirle por LinkedIn a quien publicó la búsqueda: 40 a 70 palabras, sin inventar nada.",
  },
};

/** Carta de presentación del detalle: la versión completa o el mensaje corto para LinkedIn. */
export function SeccionCarta({ oferta }: { oferta: Oferta }) {
  const [version, setVersion] = useState<VersionCarta>("completa");

  return (
    <section className="detalle__seccion" aria-labelledby="titulo-carta">
      <h3 id="titulo-carta" className="detalle__subtitulo">
        CARTA DE PRESENTACIÓN
      </h3>
      <div className="chips" role="group" aria-label="Versión de la carta">
        {(Object.keys(TEXTOS) as VersionCarta[]).map((opcion) => (
          <button
            key={opcion}
            type="button"
            className="chip"
            aria-pressed={version === opcion}
            onClick={() => setVersion(opcion)}
          >
            {TEXTOS[opcion].pestana}
          </button>
        ))}
      </div>
      {/* key: al cambiar de versión, el editor arranca con el texto de esa versión */}
      <EditorCarta key={`${oferta.id}-${version}`} oferta={oferta} version={version} />
    </section>
  );
}

function EditorCarta({ oferta, version }: { oferta: Oferta; version: VersionCarta }) {
  const carta = useCarta(oferta, version);
  const textos = TEXTOS[version];

  return (
    <>
      {carta.escribiendo ? (
        <p className="aviso" role="status">
          <span className="spinner" aria-hidden="true" /> {textos.espera}
        </p>
      ) : carta.tieneCarta ? (
        <>
          <textarea
            className={version === "completa" ? "campo campo--carta" : "campo"}
            aria-label={textos.etiqueta}
            value={carta.texto}
            onChange={(event) => carta.setTexto(event.target.value)}
          />
          <div className="detalle__botones">
            <button type="button" className="boton boton--principal" onClick={carta.copiar}>
              {carta.copiado ? "¡Copiado!" : "Copiar"}
            </button>
            <button type="button" className="boton" onClick={carta.guardar} disabled={!carta.hayCambios || carta.guardando}>
              {carta.guardando ? "Guardando..." : carta.hayCambios ? "Guardar cambios" : "Guardado"}
            </button>
            <button type="button" className="boton" onClick={carta.escribir}>
              Escribir otra versión
            </button>
          </div>
          {carta.hayCambios && <p className="detalle__ayuda">Tenés cambios sin guardar.</p>}
        </>
      ) : (
        <>
          <p className="detalle__ayuda">{textos.ayuda}</p>
          <button type="button" className="boton boton--principal" onClick={carta.escribir}>
            {textos.boton}
          </button>
        </>
      )}

      {carta.error && (
        <p className="detalle__error" role="alert">
          {carta.error}
        </p>
      )}
    </>
  );
}
