import type { ReactNode } from "react";

interface CampoProps {
  etiqueta: string;
  valor: string;
  onCambiar: (valor: string) => void;
  placeholder?: string;
  tipo?: "text" | "email" | "tel" | "url";
  autoComplete?: string;
}

/** Un dato de una línea con su etiqueta arriba. */
export function Campo({ etiqueta, valor, onCambiar, placeholder, tipo = "text", autoComplete }: CampoProps) {
  return (
    <label className="perfil__campo">
      {etiqueta}
      <input
        type={tipo}
        value={valor}
        placeholder={placeholder}
        autoComplete={autoComplete}
        onChange={(event) => onCambiar(event.target.value)}
      />
    </label>
  );
}

/** Un texto largo (presentación, descripción, respuesta). */
export function AreaTexto({ etiqueta, valor, onCambiar, placeholder }: Omit<CampoProps, "tipo" | "autoComplete">) {
  return (
    <label className="perfil__campo">
      {etiqueta}
      <textarea value={valor} placeholder={placeholder} onChange={(event) => onCambiar(event.target.value)} />
    </label>
  );
}

interface SeccionProps {
  numero: number;
  titulo: string;
  ayuda?: string;
  children: ReactNode;
}

/** Una tarjeta numerada del perfil (1. Datos personales, 2. Links...). */
export function Seccion({ numero, titulo, ayuda, children }: SeccionProps) {
  const id = `perfil-seccion-${numero}`;
  return (
    <section className="perfil__tarjeta" aria-labelledby={id}>
      <h2 id={id} className="perfil__titulo">
        <span className="perfil__numero" aria-hidden="true">
          {numero}
        </span>
        {titulo}
      </h2>
      {ayuda && <p className="perfil__ayuda">{ayuda}</p>}
      {children}
    </section>
  );
}
