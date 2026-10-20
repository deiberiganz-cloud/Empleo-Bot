import { urlFoto } from "../api/perfilApi";
import { SeccionCvs } from "../components/perfil/SeccionCvs";
import { SeccionExperiencia } from "../components/perfil/SeccionExperiencia";
import {
  SeccionBusqueda,
  SeccionDatosPersonales,
  SeccionIdiomas,
  SeccionLinks,
  SeccionRespuestas,
  SeccionResumen,
} from "../components/perfil/SeccionesPerfil";
import { completitud } from "../domain/perfil";
import type { RespuestaPerfil } from "../domain/types";
import { useArchivosPerfil, useFormularioPerfil, usePerfil } from "../hooks/usePerfil";

/** Los datos con los que se postula: se cargan una vez acá y los usa todo el bot. */
export function PerfilPage() {
  const { data, isLoading, error, refetch } = usePerfil();

  if (isLoading) {
    return (
      <p className="aviso" role="status">
        <span className="spinner" aria-hidden="true" /> Cargando tu perfil...
      </p>
    );
  }

  if (error || !data) {
    return (
      <div className="aviso aviso--error" role="alert">
        <p>{error?.message ?? "No se pudo cargar el perfil"}</p>
        <button type="button" className="boton" onClick={() => refetch()}>
          Reintentar
        </button>
      </div>
    );
  }

  return <FormularioPerfil guardado={data} />;
}

function FormularioPerfil({ guardado }: { guardado: RespuestaPerfil }) {
  const form = useFormularioPerfil(guardado.datos);
  const archivos = useArchivosPerfil();
  // Foto y CV salen de lo guardado (se suben al momento); el resto, del formulario en edición.
  const avance = completitud(form.perfil, guardado.tieneFoto, guardado.cvs);
  const { personales: yo } = form.perfil;

  const botonGuardar = (
    <button type="button" className="boton boton--principal" disabled={!form.cambios || form.guardando} onClick={form.guardar}>
      {form.guardando ? "Guardando…" : "Guardar cambios"}
    </button>
  );

  return (
    <div className="perfil">
      {/* Resumen arriba: quién eres y qué tan completo está */}
      <div className="perfil__tarjeta perfil__resumen">
        {guardado.tieneFoto ? (
          <img className="perfil__foto perfil__foto--grande" src={urlFoto(guardado.actualizado)} alt="" />
        ) : (
          <div className="perfil__foto perfil__foto--grande perfil__foto--vacia" aria-hidden="true" />
        )}
        <div className="perfil__resumen-texto">
          <h2 className="perfil__nombre">{yo.nombre || "Tu nombre"}</h2>
          <p className="perfil__ayuda">{[form.perfil.titulo, [yo.ciudad, yo.pais].filter(Boolean).join(", ")].filter(Boolean).join(" · ") || "Completa tus datos para postular"}</p>
          <div className="perfil__barra" role="progressbar" aria-label="Perfil completo" aria-valuenow={avance.porcentaje} aria-valuemin={0} aria-valuemax={100}>
            <div className="perfil__barra-relleno" style={{ width: `${avance.porcentaje}%` }} />
          </div>
          <p className="perfil__ayuda">
            Perfil completo al {avance.porcentaje} %{avance.faltan.length > 0 && ` · falta: ${avance.faltan.join(", ")}`}
          </p>
        </div>
        {botonGuardar}
      </div>

      {form.cambios && (
        <p className="aviso aviso--suave" role="status">
          Tienes cambios sin guardar.
        </p>
      )}
      {form.guardadoOk && (
        <p className="aviso aviso--suave" role="status">
          Guardado ✓
        </p>
      )}
      {(form.error || archivos.error) && (
        <p className="aviso aviso--error" role="alert">
          {form.error ?? archivos.error}
        </p>
      )}

      <SeccionDatosPersonales
        perfil={form.perfil}
        editar={form.editar}
        tieneFoto={guardado.tieneFoto}
        versionFoto={guardado.actualizado}
        subiendoFoto={archivos.subiendoFoto}
        onSubirFoto={archivos.subirFoto}
      />
      <SeccionLinks perfil={form.perfil} editar={form.editar} />
      <SeccionCvs
        cvs={guardado.cvs}
        subiendo={archivos.subiendoCv}
        onSubir={archivos.subirCv}
        onRenombrar={archivos.renombrarCv}
        onPredeterminado={archivos.marcarPredeterminado}
        onQuitar={archivos.quitarCv}
      />
      <SeccionResumen perfil={form.perfil} editar={form.editar} />
      <SeccionExperiencia experiencias={form.perfil.experiencias} editar={form.editar} />
      <SeccionIdiomas perfil={form.perfil} editar={form.editar} />
      <SeccionBusqueda perfil={form.perfil} editar={form.editar} />
      <SeccionRespuestas perfil={form.perfil} editar={form.editar} />

      <div className="perfil__pie">{botonGuardar}</div>
    </div>
  );
}
