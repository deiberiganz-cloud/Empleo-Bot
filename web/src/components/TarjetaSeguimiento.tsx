import { accionesPara } from "../domain/bandeja";
import { formatearEntrevista, necesitaSeguimiento, textoDiasPostulado } from "../domain/seguimiento";
import type { Estado, Oferta } from "../domain/types";

interface Props {
  oferta: Oferta;
  onCambiarEstado: (id: number, destino: Estado) => void;
  onAbrir: (id: number) => void;
}

/** Tarjeta compacta del tablero de Seguimiento. */
export function TarjetaSeguimiento({ oferta, onCambiarEstado, onAbrir }: Props) {
  const atrasada = necesitaSeguimiento(oferta);
  const dias = textoDiasPostulado(oferta);

  return (
    <article className={atrasada ? "tarjeta-seguimiento tarjeta-seguimiento--atrasada" : "tarjeta-seguimiento"}>
      {/* Título y empresa */}
      <h3 className="tarjeta-seguimiento__titulo">
        <button type="button" className="oferta-card__abrir" onClick={() => onAbrir(oferta.id)}>
          {oferta.titulo}
        </button>
      </h3>
      {oferta.empresa && <p className="oferta-card__datos">{oferta.empresa}</p>}

      {/* Estado de la postulación */}
      <div className="tarjeta-seguimiento__datos">
        {oferta.estado === "oferta" && <span className="etiqueta etiqueta--recomendada">✔ Oferta</span>}
        {oferta.estado === "rechazada" && <span className="etiqueta">✖ Rechazo</span>}
        {oferta.fecha_entrevista && (
          <span className="tarjeta-seguimiento__fecha">📅 {formatearEntrevista(oferta.fecha_entrevista)}</span>
        )}
        {dias && oferta.estado === "postulada" && <span className="oferta-card__fecha">{dias}</span>}
      </div>

      {/* Recordatorio de los 7 días */}
      {atrasada && (
        <div className="tarjeta-seguimiento__alerta" role="note">
          <span>⏰ Sin respuesta hace una semana o más</span>
          <button type="button" className="boton-texto" onClick={() => onAbrir(oferta.id)}>
            Escribir seguimiento
          </button>
        </div>
      )}

      {/* Mover de columna */}
      <div className="tarjeta-seguimiento__botones">
        {accionesPara(oferta.estado).map((accion) => (
          <button
            key={accion.destino}
            type="button"
            className={accion.principal ? "boton boton--chico boton--principal" : "boton boton--chico"}
            onClick={() => onCambiarEstado(oferta.id, accion.destino)}
          >
            {accion.etiqueta}
          </button>
        ))}
      </div>
    </article>
  );
}
