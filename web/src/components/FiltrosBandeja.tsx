import { PESTANAS, TIPOS, type Estado, type TipoOferta } from "../domain/types";

interface Props {
  estado: Estado;
  onEstado: (estado: Estado) => void;
  conteo: Record<Estado, number>;
  tipo: TipoOferta | null;
  onTipo: (tipo: TipoOferta | null) => void;
  soloRecomendadas: boolean;
  onSoloRecomendadas: (valor: boolean) => void;
}

export function FiltrosBandeja({ estado, onEstado, conteo, tipo, onTipo, soloRecomendadas, onSoloRecomendadas }: Props) {
  return (
    <div className="filtros">
      {/* Pestañas por estado */}
      <nav className="pestanas" aria-label="Estado de las ofertas">
        {PESTANAS.map((pestana) => (
          <button
            key={pestana.estado}
            type="button"
            className="pestanas__boton"
            aria-pressed={estado === pestana.estado}
            onClick={() => onEstado(pestana.estado)}
          >
            {pestana.etiqueta} <span className="pestanas__conteo">{conteo[pestana.estado]}</span>
          </button>
        ))}
      </nav>

      {/* Filtro por tipo */}
      <div className="chips" role="group" aria-label="Tipo de puesto">
        {TIPOS.map((opcion) => (
          <button
            key={opcion.etiqueta}
            type="button"
            className="chip"
            aria-pressed={tipo === opcion.valor}
            onClick={() => onTipo(opcion.valor)}
          >
            {opcion.etiqueta}
          </button>
        ))}
      </div>

      {/* Solo recomendadas (tiene sentido solo en Nuevas) */}
      {estado === "nueva" && (
        <label className="check">
          <input
            type="checkbox"
            checked={soloRecomendadas}
            onChange={(event) => onSoloRecomendadas(event.target.checked)}
          />
          Solo las recomendadas por Claude
        </label>
      )}
    </div>
  );
}
