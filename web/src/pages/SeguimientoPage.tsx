import { DetalleOferta } from "../components/DetalleOferta";
import { ResumenSeguimiento } from "../components/ResumenSeguimiento";
import { TarjetaSeguimiento } from "../components/TarjetaSeguimiento";
import { useSeguimiento } from "../hooks/useSeguimiento";

export function SeguimientoPage() {
  const seguimiento = useSeguimiento();

  if (seguimiento.isLoading) {
    return (
      <p className="aviso" role="status">
        <span className="spinner" aria-hidden="true" /> Cargando postulaciones...
      </p>
    );
  }

  if (seguimiento.errorCarga) {
    return (
      <div className="aviso aviso--error" role="alert">
        <p>{seguimiento.errorCarga}</p>
        <button type="button" className="boton" onClick={() => seguimiento.reintentar()}>
          Reintentar
        </button>
      </div>
    );
  }

  return (
    <>
      <ResumenSeguimiento resumen={seguimiento.resumen} />

      {seguimiento.errorCambio && (
        <p className="aviso aviso--error" role="alert">
          No se pudo guardar el cambio: {seguimiento.errorCambio}
        </p>
      )}

      {/* Tablero */}
      <div className="tablero">
        {seguimiento.columnas.map((columna) => (
          <section key={columna.id} className="tablero__columna" aria-labelledby={`columna-${columna.id}`}>
            <h2 id={`columna-${columna.id}`} className="tablero__titulo">
              {columna.titulo.toUpperCase()} <span className="pestanas__conteo">{columna.ofertas.length}</span>
            </h2>
            {columna.ofertas.map((oferta) => (
              <TarjetaSeguimiento
                key={oferta.id}
                oferta={oferta}
                onCambiarEstado={seguimiento.cambiarEstado}
                onAbrir={seguimiento.abrirOferta}
              />
            ))}
            {columna.ofertas.length === 0 && <p className="tablero__vacio">Nada por acá todavía.</p>}
          </section>
        ))}
      </div>

      {seguimiento.ofertaAbierta && (
        <DetalleOferta
          key={seguimiento.ofertaAbierta.id}
          oferta={seguimiento.ofertaAbierta}
          onCerrar={seguimiento.cerrarOferta}
          onCambiarEstado={seguimiento.cambiarEstado}
        />
      )}
    </>
  );
}
