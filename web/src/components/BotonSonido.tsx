import { useSonido } from "../hooks/useSonido";

// Botón de sonido del robot, al lado del de tema. Muestra el estado actual (parlante con ondas = prendido, con cruz = apagado).
export function BotonSonido() {
  const { prendido, alternarSonido } = useSonido();
  const etiqueta = prendido ? "Apagar el sonido" : "Prender el sonido";

  return (
    <button
      type="button"
      className="boton-tema boton-sonido"
      onClick={alternarSonido}
      aria-pressed={prendido}
      aria-label={etiqueta}
      title={etiqueta}
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M11 5 6 9H3v6h3l5 4V5Z" />
        <path d={prendido ? "M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13" : "m16 9 5 6m0-6-5 6"} />
      </svg>
    </button>
  );
}
