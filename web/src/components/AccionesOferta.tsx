import { accionesPara } from "../domain/bandeja";
import type { Estado, Oferta } from "../domain/types";

interface Props {
  oferta: Oferta;
  onCambiarEstado: (id: number, destino: Estado) => void;
}

/** "Ver oferta" + los botones de estado que corresponden. Lo usan la tarjeta y el detalle. */
export function AccionesOferta({ oferta, onCambiarEstado }: Props) {
  return (
    <div className="oferta-card__acciones">
      <a className="boton boton--enlace" href={oferta.url} target="_blank" rel="noreferrer">
        Ver oferta ↗
      </a>
      <div className="oferta-card__botones">
        {accionesPara(oferta.estado).map((accion) => (
          <button
            key={accion.destino}
            type="button"
            className={accion.principal ? "boton boton--principal" : "boton"}
            onClick={() => onCambiarEstado(oferta.id, accion.destino)}
          >
            {accion.etiqueta}
          </button>
        ))}
      </div>
    </div>
  );
}
