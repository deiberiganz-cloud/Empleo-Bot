import { DIAS_EN_ARCHIVO, FINAL, fechaBorrado } from "../domain/archivo";
import { useArchivo } from "../hooks/useArchivo";

/** Lo que ya terminó: el historial de la búsqueda y las ofertas archivadas hasta que se borran. */
export function ArchivoPage() {
  const archivo = useArchivo();

  if (archivo.isLoading) {
    return (
      <p className="aviso" role="status">
        <span className="spinner" aria-hidden="true" /> Cargando el archivo...
      </p>
    );
  }

  if (archivo.errorCarga) {
    return (
      <div className="aviso aviso--error" role="alert">
        <p>{archivo.errorCarga}</p>
        <button type="button" className="boton" onClick={() => archivo.reintentar()}>
          Reintentar
        </button>
      </div>
    );
  }

  return (
    <>
      {/* Historial de toda la búsqueda (no se pierde aunque las ofertas se borren) */}
      {archivo.tiles && (
        <section className="resumen resumen--cuatro" aria-label="Historial de la búsqueda">
          {archivo.tiles.map((tile) => (
            <div key={tile.etiqueta} className="resumen__tile">
              <p className="resumen__etiqueta">{tile.etiqueta}</p>
              <p className="resumen__valor">{tile.valor}</p>
              <p className="resumen__detalle">desde que empezaste</p>
            </div>
          ))}
        </section>
      )}

      <p className="aviso aviso--suave">
        Lo cerrado (rechazos, ofertas y descartadas) llega acá a los 7 días y se borra a los {DIAS_EN_ARCHIVO}. El
        bot recuerda lo borrado: no te lo vuelve a mostrar.
      </p>

      {archivo.errorCambio && (
        <p className="aviso aviso--error" role="alert">
          No se pudo recuperar la oferta: {archivo.errorCambio}
        </p>
      )}

      {/* Ofertas archivadas */}
      <section aria-label="Ofertas archivadas" className="archivo">
        {archivo.ofertas.map((oferta) => (
          <article key={oferta.id} className="tarjeta-seguimiento">
            <h3 className="tarjeta-seguimiento__titulo">
              <a href={oferta.url} target="_blank" rel="noreferrer">
                {oferta.titulo}
              </a>
            </h3>
            {oferta.empresa && <p className="oferta-card__datos">{oferta.empresa}</p>}
            <div className="tarjeta-seguimiento__datos">
              <span className="etiqueta">{FINAL[oferta.estado] ?? oferta.estado}</span>
              <span className="oferta-card__fecha">Se borra el {fechaBorrado(oferta)}</span>
            </div>
            {oferta.estado === "descartada" && (
              <div className="tarjeta-seguimiento__botones">
                <button type="button" className="boton boton--chico" onClick={() => archivo.recuperar(oferta.id)}>
                  Recuperar
                </button>
              </div>
            )}
          </article>
        ))}
        {archivo.ofertas.length === 0 && <p className="tablero__vacio">El archivo está vacío.</p>}
      </section>
    </>
  );
}
