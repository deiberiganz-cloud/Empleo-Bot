import { nivelPuntaje } from "../domain/bandeja";
import type { Estado, Oferta } from "../domain/types";
import { AccionesOferta } from "./AccionesOferta";

interface Props {
  oferta: Oferta;
  onCambiarEstado: (id: number, destino: Estado) => void;
  onAbrir: (id: number) => void;
}

const ETIQUETA_TIPO: Record<string, string> = {
  dev: "Dev",
  soporte: "Soporte",
  ecommerce: "E-commerce",
  automatizacion: "Automatización",
  otro: "Otro",
};

/** Formatea "2026-09-30" como "30/09". */
function fechaCorta(fecha: string): string {
  const [, mes, dia] = fecha.split("-");
  return dia && mes ? `${dia}/${mes}` : fecha;
}

export function OfertaCard({ oferta, onCambiarEstado, onAbrir }: Props) {
  const nivel = nivelPuntaje(oferta.puntaje);
  const datos = [oferta.empresa, oferta.fuente, oferta.ubicacion?.trim()].filter(Boolean).join(" · ");

  return (
    <article className="oferta-card">
      {/* Puntaje de Claude */}
      <div className={`oferta-card__puntaje oferta-card__puntaje--${nivel}`} title="Puntaje de Claude (0 a 100)">
        {oferta.puntaje ?? "–"}
      </div>

      <div className="oferta-card__cuerpo">
        {/* Título y datos */}
        <h2 className="oferta-card__titulo">
          <button type="button" className="oferta-card__abrir" onClick={() => onAbrir(oferta.id)}>
            {oferta.titulo}
          </button>
        </h2>
        {datos && <p className="oferta-card__datos">{datos}</p>}

        {/* Etiquetas */}
        <div className="oferta-card__etiquetas">
          {oferta.tipo && <span className="etiqueta">{ETIQUETA_TIPO[oferta.tipo] ?? oferta.tipo}</span>}
          {oferta.postular && !oferta.estafa && <span className="etiqueta etiqueta--recomendada">Recomendada</span>}
          {oferta.estafa && <span className="etiqueta etiqueta--estafa">⚠ Posible estafa</span>}
          {oferta.carta && <span className="etiqueta">Carta lista</span>}
          <span className="oferta-card__fecha">Encontrada el {fechaCorta(oferta.encontrada)}</span>
        </div>

        {/* Por qué (motivo de Claude) */}
        {oferta.motivo && <p className="oferta-card__motivo">{oferta.motivo}</p>}

        {/* Acciones */}
        <AccionesOferta oferta={oferta} onCambiarEstado={onCambiarEstado} />
      </div>
    </article>
  );
}
