import type { ResumenSeguimiento as Resumen } from "../domain/seguimiento";

/** Los tres números de arriba del tablero (stat tiles: texto en tinta, sin colores). */
export function ResumenSeguimiento({ resumen }: { resumen: Resumen }) {
  return (
    <section className="resumen" aria-label="Resumen de la búsqueda">
      <div className="resumen__tile">
        <p className="resumen__etiqueta">Postulaciones esta semana</p>
        <p className="resumen__valor">{resumen.postulacionesSemana}</p>
        <p className="resumen__detalle">{resumen.postuladas} en total</p>
      </div>
      <div className="resumen__tile">
        <p className="resumen__etiqueta">Entrevistas</p>
        <p className="resumen__valor">{resumen.entrevistas}</p>
        <p className="resumen__detalle">conseguidas hasta ahora</p>
      </div>
      <div className="resumen__tile">
        <p className="resumen__etiqueta">Tasa de respuesta</p>
        <p className="resumen__valor">{resumen.tasaRespuesta === null ? "—" : `${resumen.tasaRespuesta}%`}</p>
        <p className="resumen__detalle">
          {resumen.postuladas ? `${resumen.respondidas} de ${resumen.postuladas} te respondieron` : "todavía sin postulaciones"}
        </p>
      </div>
    </section>
  );
}
