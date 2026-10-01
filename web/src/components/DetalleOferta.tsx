import { useEffect, useRef } from "react";
import { nivelPuntaje } from "../domain/bandeja";
import type { Estado, Oferta } from "../domain/types";
import { useCarta } from "../hooks/useCarta";
import { useNotas } from "../hooks/useNotas";
import { AccionesOferta } from "./AccionesOferta";
import { SeccionEntrevista, SeccionMensajeSeguimiento } from "./SeccionesSeguimiento";

interface Props {
  oferta: Oferta;
  onCerrar: () => void;
  onCambiarEstado: (id: number, destino: Estado) => void;
}

/**
 * Panel lateral con todo sobre una oferta: descripción, notas y carta de presentación.
 * Se monta con `key={oferta.id}` para que notas y carta arranquen limpias con cada oferta.
 */
export function DetalleOferta({ oferta, onCerrar, onCambiarEstado }: Props) {
  const carta = useCarta(oferta);
  const notas = useNotas(oferta);
  const botonCerrar = useRef<HTMLButtonElement>(null);

  // Al abrir: foco en "cerrar", Escape cierra y la página de atrás no se desplaza.
  useEffect(() => {
    botonCerrar.current?.focus();
    const alTeclear = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCerrar();
    };
    document.addEventListener("keydown", alTeclear);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", alTeclear);
      document.body.style.overflow = "";
    };
  }, [onCerrar]);

  const datos = [oferta.empresa, oferta.fuente, oferta.ubicacion?.trim()].filter(Boolean).join(" · ");

  return (
    <div className="detalle-fondo" onClick={onCerrar}>
      <aside
        className="detalle"
        role="dialog"
        aria-modal="true"
        aria-labelledby="detalle-titulo"
        onClick={(event) => event.stopPropagation()}
      >
        {/* Encabezado */}
        <div className="detalle__encabezado">
          <div className={`oferta-card__puntaje oferta-card__puntaje--${nivelPuntaje(oferta.puntaje)}`}>
            {oferta.puntaje ?? "–"}
          </div>
          <div className="detalle__titulos">
            <h2 id="detalle-titulo" className="oferta-card__titulo">
              {oferta.titulo}
            </h2>
            {datos && <p className="oferta-card__datos">{datos}</p>}
          </div>
          <button ref={botonCerrar} type="button" className="detalle__cerrar" aria-label="Cerrar" onClick={onCerrar}>
            ✕
          </button>
        </div>

        {oferta.motivo && <p className="oferta-card__motivo">{oferta.motivo}</p>}

        {/* Acciones */}
        <AccionesOferta oferta={oferta} onCambiarEstado={onCambiarEstado} />

        {/* Seguimiento y entrevista (solo cuando corresponde) */}
        {oferta.estado === "postulada" && <SeccionMensajeSeguimiento oferta={oferta} />}
        {(oferta.estado === "entrevista" || oferta.fecha_entrevista) && <SeccionEntrevista oferta={oferta} />}

        {/* Carta de presentación */}
        <section className="detalle__seccion" aria-labelledby="titulo-carta">
          <h3 id="titulo-carta" className="detalle__subtitulo">
            CARTA DE PRESENTACIÓN
          </h3>

          {carta.escribiendo ? (
            <p className="aviso" role="status">
              <span className="spinner" aria-hidden="true" /> Claude está escribiendo tu carta… (unos 20 segundos)
            </p>
          ) : carta.tieneCarta ? (
            <>
              <textarea
                className="campo campo--carta"
                aria-label="Carta de presentación"
                value={carta.texto}
                onChange={(event) => carta.setTexto(event.target.value)}
              />
              <div className="detalle__botones">
                <button type="button" className="boton boton--principal" onClick={carta.copiar}>
                  {carta.copiado ? "¡Copiada!" : "Copiar"}
                </button>
                <button
                  type="button"
                  className="boton"
                  onClick={carta.guardar}
                  disabled={!carta.hayCambios || carta.guardando}
                >
                  {carta.guardando ? "Guardando..." : carta.hayCambios ? "Guardar cambios" : "Guardada"}
                </button>
                <button type="button" className="boton" onClick={carta.escribir}>
                  Escribir otra versión
                </button>
              </div>
              {carta.hayCambios && <p className="detalle__ayuda">Tenés cambios sin guardar.</p>}
            </>
          ) : (
            <>
              <p className="detalle__ayuda">
                Claude escribe una carta con tu perfil y lo que pide esta oferta, sin inventar nada.
              </p>
              <button type="button" className="boton boton--principal" onClick={carta.escribir}>
                Escribir carta
              </button>
            </>
          )}

          {carta.error && (
            <p className="detalle__error" role="alert">
              {carta.error}
            </p>
          )}
        </section>

        {/* Notas */}
        <section className="detalle__seccion" aria-labelledby="titulo-notas">
          <h3 id="titulo-notas" className="detalle__subtitulo">
            NOTAS
          </h3>
          <textarea
            className="campo"
            aria-label="Notas"
            placeholder="Ej.: piden portfolio, hablé con la reclutadora, entrevista el lunes..."
            value={notas.texto}
            onChange={(event) => notas.setTexto(event.target.value)}
            onBlur={notas.guardarSiCambio}
          />
          <p className="detalle__ayuda" role="status">
            {notas.guardando ? "Guardando..." : notas.guardadoOk ? "Guardado ✓" : "Se guardan solas al salir del cuadro."}
          </p>
          {notas.error && (
            <p className="detalle__error" role="alert">
              {notas.error}
            </p>
          )}
        </section>

        {/* Descripción completa */}
        <section className="detalle__seccion" aria-labelledby="titulo-descripcion">
          <h3 id="titulo-descripcion" className="detalle__subtitulo">
            DESCRIPCIÓN DE LA OFERTA
          </h3>
          <p className="detalle__descripcion">{oferta.descripcion || "Esta oferta no trae descripción."}</p>
        </section>
      </aside>
    </div>
  );
}
