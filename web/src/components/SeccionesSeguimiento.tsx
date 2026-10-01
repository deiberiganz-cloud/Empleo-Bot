import { necesitaSeguimiento, textoDiasPostulado } from "../domain/seguimiento";
import type { Oferta } from "../domain/types";
import { useEntrevista } from "../hooks/useEntrevista";
import { useMensajeSeguimiento } from "../hooks/useMensajeSeguimiento";

/** Sección "Entrevista" del panel de detalle: fecha y hora, guardadas solas. */
export function SeccionEntrevista({ oferta }: { oferta: Oferta }) {
  const entrevista = useEntrevista(oferta);
  return (
    <section className="detalle__seccion" aria-labelledby="titulo-entrevista">
      <h3 id="titulo-entrevista" className="detalle__subtitulo">
        ENTREVISTA
      </h3>
      <label className="detalle__ayuda" htmlFor="fecha-entrevista">
        Fecha y hora
      </label>
      <div className="detalle__botones">
        <input
          id="fecha-entrevista"
          type="datetime-local"
          className="campo campo--fecha"
          value={entrevista.valor}
          onChange={(event) => entrevista.cambiar(event.target.value)}
        />
        {entrevista.valor && (
          <button type="button" className="boton" onClick={() => entrevista.cambiar("")}>
            Borrar fecha
          </button>
        )}
      </div>
      <p className="detalle__ayuda" role="status">
        {entrevista.guardando ? "Guardando..." : entrevista.guardadoOk ? "Guardado ✓" : ""}
      </p>
      {entrevista.error && (
        <p className="detalle__error" role="alert">
          {entrevista.error}
        </p>
      )}
    </section>
  );
}

/** Sección "Seguimiento" del panel de detalle: mensaje para preguntar cómo sigue el proceso. */
export function SeccionMensajeSeguimiento({ oferta }: { oferta: Oferta }) {
  const mensaje = useMensajeSeguimiento(oferta);
  const dias = textoDiasPostulado(oferta);

  return (
    <section className="detalle__seccion" aria-labelledby="titulo-seguimiento">
      <h3 id="titulo-seguimiento" className="detalle__subtitulo">
        SEGUIMIENTO
      </h3>
      <p className="detalle__ayuda">
        {dias ?? "Postulada"}.{" "}
        {necesitaSeguimiento(oferta)
          ? "Ya pasó una semana: es un buen momento para preguntar cómo sigue el proceso."
          : "Si en 7 días no hay respuesta, te lo recuerdo en el tablero."}
      </p>

      {mensaje.escribiendo ? (
        <p className="aviso" role="status">
          <span className="spinner" aria-hidden="true" /> Claude está escribiendo el mensaje… (unos 15 segundos)
        </p>
      ) : mensaje.tieneMensaje ? (
        <>
          <textarea
            className="campo"
            aria-label="Mensaje de seguimiento"
            value={mensaje.texto}
            onChange={(event) => mensaje.setTexto(event.target.value)}
          />
          <div className="detalle__botones">
            <button type="button" className="boton boton--principal" onClick={mensaje.copiar}>
              {mensaje.copiado ? "¡Copiado!" : "Copiar"}
            </button>
            <button type="button" className="boton" onClick={mensaje.escribir}>
              Escribir otra versión
            </button>
          </div>
        </>
      ) : (
        <button type="button" className="boton" onClick={mensaje.escribir}>
          Escribir mensaje de seguimiento
        </button>
      )}

      {mensaje.error && (
        <p className="detalle__error" role="alert">
          {mensaje.error}
        </p>
      )}
    </section>
  );
}
