import { textoAvisos, textoProxima, textoUltimaBusqueda } from "../domain/busqueda";
import { useBusqueda } from "../hooks/useBusqueda";

/**
 * Arriba de la Bandeja: botón "Buscar ahora" y cómo fue la última búsqueda.
 * La app también busca sola cada 12 horas mientras está abierta.
 */
export function BarraBusqueda() {
  const busqueda = useBusqueda();
  const { estado } = busqueda;
  const avisos = estado?.ultima ? textoAvisos(estado.ultima.errores) : null;
  const error = busqueda.errorAlBuscar ?? estado?.error ?? busqueda.errorCarga;

  return (
    <div className="revisar-gmail barra-busqueda">
      <button type="button" className="boton" disabled={busqueda.buscando || !estado} onClick={busqueda.buscar}>
        {busqueda.buscando ? "Buscando ofertas..." : "Buscar ahora"}
      </button>
      <div className="barra-busqueda__textos">
        <p className="revisar-gmail__estado" role="status">
          {busqueda.buscando ? (
            <>
              <span className="spinner" aria-hidden="true" /> Bajando portales y evaluando con Claude: tarda unos minutos.
            </>
          ) : (
            estado && textoUltimaBusqueda(estado.ultima)
          )}
        </p>
        {!busqueda.buscando && estado && (
          <p className="revisar-gmail__estado">
            {textoProxima(estado.proxima)}
            {avisos && (
              // Los errores completos quedan en el title: se ven pasando el mouse (o tocando en el celular).
              <span className="barra-busqueda__avisos" title={estado.ultima?.errores.join("\n")}>
                {" "}· ⚠ {avisos}
              </span>
            )}
          </p>
        )}
        {error && !busqueda.buscando && (
          <p className="revisar-gmail__estado barra-busqueda__error" role="alert">
            No se pudo buscar: {error}
          </p>
        )}
      </div>
    </div>
  );
}
