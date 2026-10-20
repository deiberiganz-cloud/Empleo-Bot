import { useState } from "react";
import { urlCv } from "../../api/perfilApi";
import { tamanoLegible } from "../../domain/perfil";
import type { Cv } from "../../domain/types";
import { Seccion } from "./Campos";

interface SeccionCvsProps {
  cvs: Cv[];
  subiendo: boolean;
  onSubir: (archivo: File) => void;
  onRenombrar: (id: number, nombre: string) => void;
  onPredeterminado: (id: number) => void;
  onQuitar: (id: number) => void;
}

/** El nombre de un CV, editable en el lugar (se guarda al salir del cuadro). */
function NombreCv({ cv, onRenombrar }: { cv: Cv; onRenombrar: (id: number, nombre: string) => void }) {
  const [nombre, setNombre] = useState(cv.nombre);
  return (
    <input
      className="perfil__entrada perfil__entrada--titulo"
      aria-label="Nombre del CV"
      value={nombre}
      onChange={(event) => setNombre(event.target.value)}
      onBlur={() => {
        if (nombre.trim() && nombre !== cv.nombre) onRenombrar(cv.id, nombre);
        else setNombre(cv.nombre);
      }}
    />
  );
}

/* ---- 3. Currículum (CV) ---- */
export function SeccionCvs({ cvs, subiendo, onSubir, onRenombrar, onPredeterminado, onQuitar }: SeccionCvsProps) {
  return (
    <Seccion numero={3} titulo="Currículum (CV)" ayuda="El predeterminado es el que se adjunta al postular. Puedes tener uno por tipo de puesto.">
      {cvs.length === 0 && <p className="perfil__vacio">Todavía no subiste ningún CV: sin CV no se puede postular.</p>}
      <ul className="perfil__lista">
        {cvs.map((cv) => (
          <li key={cv.id} className="perfil__item">
            <div className="perfil__item-texto">
              <NombreCv key={cv.nombre} cv={cv} onRenombrar={onRenombrar} />
              <span className="perfil__item-sub">
                {cv.nombre_original} · {tamanoLegible(cv.tamano)} · subido el {new Date(cv.subido).toLocaleDateString("es-AR")}
              </span>
            </div>
            <div className="perfil__fila">
              {cv.predeterminado ? (
                <span className="perfil__predeterminado">Predeterminado</span>
              ) : (
                <button type="button" className="boton boton--enlace boton--chico" onClick={() => onPredeterminado(cv.id)}>
                  Marcar predeterminado
                </button>
              )}
              <a className="boton boton--enlace boton--chico" href={urlCv(cv.id)} target="_blank" rel="noreferrer">
                Ver
              </a>
              <button type="button" className="boton boton--enlace boton--chico" onClick={() => onQuitar(cv.id)}>
                Quitar
              </button>
            </div>
          </li>
        ))}
      </ul>
      <div>
        <label className="boton boton--principal perfil__subir">
          {subiendo ? "Subiendo…" : cvs.length ? "+ Subir otro CV" : "+ Subir CV (PDF)"}
          <input
            type="file"
            accept="application/pdf"
            className="perfil__archivo"
            disabled={subiendo}
            onChange={(event) => {
              const archivo = event.target.files?.[0];
              if (archivo) onSubir(archivo);
              event.target.value = "";
            }}
          />
        </label>
      </div>
    </Seccion>
  );
}
