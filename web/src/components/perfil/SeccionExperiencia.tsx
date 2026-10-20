import { useState } from "react";
import { EXPERIENCIA_VACIA, mover, periodo, quitar, reemplazar } from "../../domain/perfil";
import type { Experiencia } from "../../domain/types";
import { AreaTexto, Campo, Seccion } from "./Campos";
import type { Editar } from "./SeccionesPerfil";

interface SeccionExperienciaProps {
  experiencias: Experiencia[];
  editar: Editar;
}

/* ---- 5. Experiencia y estudios ---- */
export function SeccionExperiencia({ experiencias, editar }: SeccionExperienciaProps) {
  // La que está abierta para editar (una a la vez, así la lista se lee de un vistazo).
  const [abierta, setAbierta] = useState<number | null>(null);

  const cambiar = (indice: number, cambios: Partial<Experiencia>) =>
    editar((p) => ({ ...p, experiencias: reemplazar(p.experiencias, indice, cambios) }));

  const agregar = (tipo: Experiencia["tipo"]) => {
    editar((p) => ({ ...p, experiencias: [...p.experiencias, EXPERIENCIA_VACIA(tipo)] }));
    setAbierta(experiencias.length);
  };

  return (
    <Seccion numero={5} titulo="Experiencia y estudios" ayuda="Una tarjeta por trabajo o estudio: los formularios piden las fechas de cada uno.">
      <ul className="perfil__lista">
        {experiencias.map((exp, indice) => {
          const titulo = [exp.titulo, exp.lugar].filter(Boolean).join(" · ") || (exp.tipo === "estudio" ? "Estudio nuevo" : "Trabajo nuevo");
          return (
            <li key={indice} className="perfil__item perfil__item--columna">
              <div className="perfil__item-cabecera">
                <div className="perfil__item-texto">
                  <span className="perfil__item-titulo">
                    {exp.tipo === "estudio" ? "🎓 " : ""}
                    {titulo}
                  </span>
                  {periodo(exp) && <span className="perfil__item-sub">{periodo(exp)}</span>}
                </div>
                <div className="perfil__fila">
                  <button type="button" className="boton boton--enlace boton--chico" aria-label={`Subir ${titulo}`} disabled={indice === 0} onClick={() => editar((p) => ({ ...p, experiencias: mover(p.experiencias, indice, -1) }))}>
                    ↑
                  </button>
                  <button type="button" className="boton boton--enlace boton--chico" aria-label={`Bajar ${titulo}`} disabled={indice === experiencias.length - 1} onClick={() => editar((p) => ({ ...p, experiencias: mover(p.experiencias, indice, 1) }))}>
                    ↓
                  </button>
                  <button type="button" className="boton boton--enlace boton--chico" aria-expanded={abierta === indice} onClick={() => setAbierta(abierta === indice ? null : indice)}>
                    {abierta === indice ? "Listo" : "Editar"}
                  </button>
                </div>
              </div>

              {abierta === indice && (
                <div className="perfil__columna">
                  <div className="perfil__grilla">
                    <Campo etiqueta={exp.tipo === "estudio" ? "Título o carrera" : "Puesto"} valor={exp.titulo} onCambiar={(valor) => cambiar(indice, { titulo: valor })} />
                    <Campo etiqueta={exp.tipo === "estudio" ? "Institución" : "Empresa o proyecto"} valor={exp.lugar} onCambiar={(lugar) => cambiar(indice, { lugar })} />
                    <Campo etiqueta="Desde" placeholder="mar. 2019" valor={exp.desde} onCambiar={(desde) => cambiar(indice, { desde })} />
                    <Campo etiqueta="Hasta" placeholder="actualidad" valor={exp.hasta} onCambiar={(hasta) => cambiar(indice, { hasta })} />
                  </div>
                  <AreaTexto etiqueta="Qué hiciste" valor={exp.descripcion} onCambiar={(descripcion) => cambiar(indice, { descripcion })} />
                  <div>
                    <button
                      type="button"
                      className="boton boton--enlace boton--chico"
                      onClick={() => {
                        editar((p) => ({ ...p, experiencias: quitar(p.experiencias, indice) }));
                        setAbierta(null);
                      }}
                    >
                      Quitar
                    </button>
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>
      <div className="perfil__fila">
        <button type="button" className="boton boton--principal" onClick={() => agregar("trabajo")}>
          + Agregar experiencia
        </button>
        <button type="button" className="boton boton--enlace" onClick={() => agregar("estudio")}>
          + Agregar estudio
        </button>
      </div>
    </Seccion>
  );
}
