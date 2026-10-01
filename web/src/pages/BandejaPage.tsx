import { DetalleOferta } from "../components/DetalleOferta";
import { FiltrosBandeja } from "../components/FiltrosBandeja";
import { OfertaCard } from "../components/OfertaCard";
import { useBandeja } from "../hooks/useBandeja";

const VACIO: Record<string, string> = {
  nueva: "No hay ofertas nuevas con estos filtros.",
  me_interesa: "Todavía no marcaste ninguna oferta con «Me interesa».",
  descartada: "No descartaste ninguna oferta.",
};

export function BandejaPage() {
  const bandeja = useBandeja();

  return (
    <>
        <FiltrosBandeja
          estado={bandeja.estado}
          onEstado={bandeja.setEstado}
          conteo={bandeja.conteo}
          tipo={bandeja.tipo}
          onTipo={bandeja.setTipo}
          soloRecomendadas={bandeja.soloRecomendadas}
          onSoloRecomendadas={bandeja.setSoloRecomendadas}
        />

        {/* Error al cambiar un estado (la tarjeta ya volvió a su lugar) */}
        {bandeja.errorCambio && (
          <p className="aviso aviso--error" role="alert">
            No se pudo guardar el cambio: {bandeja.errorCambio}
          </p>
        )}

        {/* Lista */}
        {bandeja.isLoading ? (
          <p className="aviso" role="status">
            <span className="spinner" aria-hidden="true" /> Cargando ofertas...
          </p>
        ) : bandeja.errorCarga ? (
          <div className="aviso aviso--error" role="alert">
            <p>{bandeja.errorCarga}</p>
            <button type="button" className="boton" onClick={() => bandeja.reintentar()}>
              Reintentar
            </button>
          </div>
        ) : (
          <>
            <section className="lista" aria-label="Ofertas">
              {bandeja.visibles.map((oferta) => (
                <OfertaCard
                  key={oferta.id}
                  oferta={oferta}
                  onCambiarEstado={bandeja.cambiarEstado}
                  onAbrir={bandeja.abrirOferta}
                />
              ))}
            </section>
            {bandeja.visibles.length === 0 && <p className="aviso">{VACIO[bandeja.estado]}</p>}
            {bandeja.ocultasPorRecomendacion > 0 && (
              <p className="aviso aviso--suave">
                Hay {bandeja.ocultasPorRecomendacion} ofertas más que Claude no recomienda.{" "}
                <button type="button" className="boton-texto" onClick={() => bandeja.setSoloRecomendadas(false)}>
                  Verlas igual
                </button>
              </p>
            )}
          </>
        )}
      {/* Panel de detalle (carta y notas) */}
      {bandeja.ofertaAbierta && (
        <DetalleOferta
          key={bandeja.ofertaAbierta.id}
          oferta={bandeja.ofertaAbierta}
          onCerrar={bandeja.cerrarOferta}
          onCambiarEstado={bandeja.cambiarEstado}
        />
      )}
    </>
  );
}
