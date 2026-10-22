import { useState } from "react";
import { urlFoto } from "../../api/perfilApi";
import { mover, NIVELES_BUSQUEDA, NIVELES_IDIOMA, quitar, reemplazar } from "../../domain/perfil";
import type { Perfil } from "../../domain/types";
import { AreaTexto, Campo, Seccion } from "./Campos";

export type Editar = (cambio: (actual: Perfil) => Perfil) => void;

interface SeccionPerfilProps {
  perfil: Perfil;
  editar: Editar;
}

const MODALIDADES = ["Solo remoto", "Remoto o híbrido", "Cualquiera"];
const MONEDAS = ["ARS · mensual bruto", "USD · mensual bruto", "USD · por hora"];
const DISPONIBILIDADES = ["Inmediata", "En 15 días", "En 30 días"];
const SENIORITIES = NIVELES_BUSQUEDA;

/** Un desplegable que también muestra el valor guardado aunque no esté en las opciones. */
function Opciones({ etiqueta, valor, opciones, onCambiar }: { etiqueta: string; valor: string; opciones: string[]; onCambiar: (valor: string) => void }) {
  const todas = valor && !opciones.includes(valor) ? [valor, ...opciones] : opciones;
  return (
    <label className="perfil__campo">
      {etiqueta}
      <select value={valor} onChange={(event) => onCambiar(event.target.value)}>
        <option value="">Elegir…</option>
        {todas.map((opcion) => (
          <option key={opcion} value={opcion}>
            {opcion}
          </option>
        ))}
      </select>
    </label>
  );
}

/** Un texto + botón "Agregar" (Enter también agrega). Se usa para habilidades y puestos. */
function AgregarTexto({ etiqueta, placeholder, onAgregar }: { etiqueta: string; placeholder: string; onAgregar: (texto: string) => void }) {
  const [texto, setTexto] = useState("");
  const agregar = () => {
    if (!texto.trim()) return;
    onAgregar(texto.trim());
    setTexto("");
  };
  return (
    <div className="perfil__fila">
      <input
        className="perfil__entrada"
        aria-label={etiqueta}
        value={texto}
        placeholder={placeholder}
        onChange={(event) => setTexto(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            agregar();
          }
        }}
      />
      <button type="button" className="boton boton--enlace" onClick={agregar}>
        + Agregar
      </button>
    </div>
  );
}

interface DatosPersonalesProps extends SeccionPerfilProps {
  tieneFoto: boolean;
  versionFoto: string | null;
  subiendoFoto: boolean;
  onSubirFoto: (archivo: File) => void;
}

/* ---- 1. Datos personales (con la foto) ---- */
export function SeccionDatosPersonales({ perfil, editar, tieneFoto, versionFoto, subiendoFoto, onSubirFoto }: DatosPersonalesProps) {
  const dato = (campo: keyof Perfil["personales"]) => ({
    valor: perfil.personales[campo],
    onCambiar: (valor: string) => editar((p) => ({ ...p, personales: { ...p.personales, [campo]: valor } })),
  });

  return (
    <Seccion numero={1} titulo="Datos personales">
      {/* Foto de perfil */}
      <div className="perfil__fila perfil__fila--foto">
        {tieneFoto ? (
          <img className="perfil__foto" src={urlFoto(versionFoto)} alt="Tu foto de perfil" />
        ) : (
          <div className="perfil__foto perfil__foto--vacia" aria-hidden="true" />
        )}
        <div className="perfil__columna">
          <label className="boton boton--enlace perfil__subir">
            {subiendoFoto ? "Subiendo…" : tieneFoto ? "Cambiar foto" : "Subir foto de perfil"}
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="perfil__archivo"
              disabled={subiendoFoto}
              onChange={(event) => {
                const archivo = event.target.files?.[0];
                if (archivo) onSubirFoto(archivo);
                event.target.value = "";
              }}
            />
          </label>
          <p className="perfil__ayuda">JPG, PNG o WebP, cuadrada (máximo 5 MB). La piden algunos portales.</p>
        </div>
      </div>

      <div className="perfil__grilla">
        <Campo etiqueta="Nombre completo" autoComplete="name" {...dato("nombre")} />
        <Campo etiqueta="Fecha de nacimiento" placeholder="dd/mm/aaaa" {...dato("fechaNacimiento")} />
        <Campo etiqueta="Teléfono (WhatsApp)" tipo="tel" autoComplete="tel" {...dato("telefono")} />
        <Campo etiqueta="Email" tipo="email" autoComplete="email" {...dato("email")} />
        <Campo etiqueta="Calle y número" autoComplete="street-address" {...dato("direccion")} />
        <Campo etiqueta="Código postal" autoComplete="postal-code" {...dato("codigoPostal")} />
        <Campo etiqueta="Ciudad o barrio" {...dato("ciudad")} />
        <Campo etiqueta="Provincia" {...dato("provincia")} />
        <Campo etiqueta="País" autoComplete="country-name" {...dato("pais")} />
        <Campo etiqueta="DNI (opcional)" {...dato("dni")} />
      </div>
    </Seccion>
  );
}

/* ---- 2. Links ---- */
export function SeccionLinks({ perfil, editar }: SeccionPerfilProps) {
  const cambiarLink = (indice: number, cambios: Partial<Perfil["links"][number]>) =>
    editar((p) => ({ ...p, links: reemplazar(p.links, indice, cambios) }));

  return (
    <Seccion numero={2} titulo="Links" ayuda="LinkedIn, GitHub, portfolio: lo que quieras mostrar en las postulaciones.">
      {perfil.links.map((link, indice) => (
        <div key={indice} className="perfil__item perfil__item--link">
          <Campo etiqueta="Nombre" placeholder="LinkedIn" valor={link.nombre} onCambiar={(nombre) => cambiarLink(indice, { nombre })} />
          <Campo etiqueta="Dirección" tipo="url" placeholder="https://…" valor={link.url} onCambiar={(url) => cambiarLink(indice, { url })} />
          <button type="button" className="boton boton--enlace boton--chico" onClick={() => editar((p) => ({ ...p, links: quitar(p.links, indice) }))}>
            Quitar
          </button>
        </div>
      ))}
      <div>
        <button type="button" className="boton boton--enlace" onClick={() => editar((p) => ({ ...p, links: [...p.links, { nombre: "", url: "" }] }))}>
          + Agregar link
        </button>
      </div>
    </Seccion>
  );
}

/* ---- 4. Resumen y habilidades ---- */
export function SeccionResumen({ perfil, editar }: SeccionPerfilProps) {
  return (
    <Seccion numero={4} titulo="Resumen y habilidades">
      <Campo etiqueta="Título profesional" placeholder="Desarrollador Full Stack" valor={perfil.titulo} onCambiar={(titulo) => editar((p) => ({ ...p, titulo }))} />
      <AreaTexto
        etiqueta='Presentación corta (para "Cuéntanos de ti")'
        valor={perfil.presentacion}
        onCambiar={(presentacion) => editar((p) => ({ ...p, presentacion }))}
      />
      <div className="perfil__campo">
        Habilidades
        <ul className="perfil__chips" aria-label="Habilidades">
          {perfil.habilidades.map((habilidad, indice) => (
            <li key={habilidad} className="perfil__chip">
              {habilidad}
              <button
                type="button"
                className="perfil__chip-quitar"
                aria-label={`Quitar ${habilidad}`}
                onClick={() => editar((p) => ({ ...p, habilidades: quitar(p.habilidades, indice) }))}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
        <AgregarTexto
          etiqueta="Nueva habilidad"
          placeholder="React, Excel, atención al cliente…"
          onAgregar={(habilidad) =>
            editar((p) => (p.habilidades.includes(habilidad) ? p : { ...p, habilidades: [...p.habilidades, habilidad] }))
          }
        />
      </div>
    </Seccion>
  );
}

/* ---- 6. Idiomas ---- */
export function SeccionIdiomas({ perfil, editar }: SeccionPerfilProps) {
  return (
    <Seccion numero={6} titulo="Idiomas" ayuda="Sé honesto con el nivel: es lo primero que prueban en una entrevista.">
      {perfil.idiomas.map((idioma, indice) => (
        <div key={indice} className="perfil__item perfil__item--link">
          <Campo
            etiqueta="Idioma"
            placeholder="Inglés"
            valor={idioma.idioma}
            onCambiar={(valor) => editar((p) => ({ ...p, idiomas: reemplazar(p.idiomas, indice, { idioma: valor }) }))}
          />
          <Opciones
            etiqueta="Nivel"
            valor={idioma.nivel}
            opciones={NIVELES_IDIOMA}
            onCambiar={(nivel) => editar((p) => ({ ...p, idiomas: reemplazar(p.idiomas, indice, { nivel }) }))}
          />
          <button type="button" className="boton boton--enlace boton--chico" onClick={() => editar((p) => ({ ...p, idiomas: quitar(p.idiomas, indice) }))}>
            Quitar
          </button>
        </div>
      ))}
      <div>
        <button type="button" className="boton boton--enlace" onClick={() => editar((p) => ({ ...p, idiomas: [...p.idiomas, { idioma: "", nivel: "" }] }))}>
          + Agregar idioma
        </button>
      </div>
    </Seccion>
  );
}

/* ---- 7. Qué busco ---- */
export function SeccionBusqueda({ perfil, editar }: SeccionPerfilProps) {
  const { busqueda } = perfil;
  const dato = (campo: Exclude<keyof Perfil["busqueda"], "puestos" | "niveles">) => ({
    valor: busqueda[campo],
    onCambiar: (valor: string) => editar((p) => ({ ...p, busqueda: { ...p.busqueda, [campo]: valor } })),
  });
  const cambiarPuestos = (cambio: (puestos: string[]) => string[]) =>
    editar((p) => ({ ...p, busqueda: { ...p.busqueda, puestos: cambio(p.busqueda.puestos) } }));

  const cambiarNiveles = (niveles: string[]) => editar((p) => ({ ...p, busqueda: { ...p.busqueda, niveles } }));

  return (
    <Seccion numero={7} titulo="Qué busco">
      <div className="perfil__campo">
        Puestos que te sirven (de mejor a menos preferido)
        <ol className="perfil__lista">
          {busqueda.puestos.map((puesto, indice) => (
            <li key={`${indice}-${puesto}`} className="perfil__item">
              <span className="perfil__item-texto">
                {indice + 1}. {puesto}
              </span>
              <span className="perfil__fila">
                <button type="button" className="boton boton--enlace boton--chico" aria-label={`Subir ${puesto}`} disabled={indice === 0} onClick={() => cambiarPuestos((lista) => mover(lista, indice, -1))}>
                  ↑
                </button>
                <button type="button" className="boton boton--enlace boton--chico" aria-label={`Bajar ${puesto}`} disabled={indice === busqueda.puestos.length - 1} onClick={() => cambiarPuestos((lista) => mover(lista, indice, 1))}>
                  ↓
                </button>
                <button type="button" className="boton boton--enlace boton--chico" aria-label={`Quitar ${puesto}`} onClick={() => cambiarPuestos((lista) => quitar(lista, indice))}>
                  Quitar
                </button>
              </span>
            </li>
          ))}
        </ol>
        <AgregarTexto etiqueta="Nuevo puesto" placeholder="Soporte técnico en español" onAgregar={(puesto) => cambiarPuestos((lista) => [...lista, puesto])} />
      </div>

      <div className="perfil__campo">
        Niveles que buscas
        <div className="perfil__chips" role="group" aria-label="Niveles que buscas">
          {NIVELES_BUSQUEDA.map((nivel) => {
            const marcado = busqueda.niveles.includes(nivel);
            return (
              <button
                key={nivel}
                type="button"
                className={`perfil__nivel${marcado ? " perfil__nivel--activo" : ""}`}
                aria-pressed={marcado}
                onClick={() => cambiarNiveles(marcado ? busqueda.niveles.filter((n) => n !== nivel) : [...busqueda.niveles, nivel])}
              >
                {nivel}
              </button>
            );
          })}
        </div>
        <p className="perfil__ayuda">Sin marcar = todos los niveles. Los avisos que no dicen nivel siempre pasan.</p>
      </div>

      <div className="perfil__grilla">
        <Opciones etiqueta="Modalidad" opciones={MODALIDADES} {...dato("modalidad")} />
        <Campo etiqueta="Países que aceptas" placeholder="Argentina, Latam, España" {...dato("paises")} />
        <Campo etiqueta="Sueldo pretendido" placeholder="1.800.000" {...dato("sueldo")} />
        <Opciones etiqueta="Moneda y período" opciones={MONEDAS} {...dato("moneda")} />
        <Opciones etiqueta="Disponibilidad" opciones={DISPONIBILIDADES} {...dato("disponibilidad")} />
        <Opciones etiqueta="Tu seniority" opciones={SENIORITIES} {...dato("seniority")} />
      </div>
      <AreaTexto
        etiqueta="Cuándo NO te sirve una oferta"
        placeholder="Pide inglés avanzado, es presencial, pide pagar algo…"
        {...dato("noSirve")}
      />
    </Seccion>
  );
}

/* ---- 8. Respuestas frecuentes ---- */
export function SeccionRespuestas({ perfil, editar }: SeccionPerfilProps) {
  const cambiar = (indice: number, cambios: Partial<Perfil["respuestas"][number]>) =>
    editar((p) => ({ ...p, respuestas: reemplazar(p.respuestas, indice, cambios) }));

  return (
    <Seccion numero={8} titulo="Respuestas frecuentes" ayuda="Lo que los formularios preguntan siempre. Se usan tal cual al postular.">
      {perfil.respuestas.map((respuesta, indice) => (
        <div key={indice} className="perfil__item perfil__item--columna">
          <Campo etiqueta="Pregunta" valor={respuesta.pregunta} onCambiar={(pregunta) => cambiar(indice, { pregunta })} />
          <AreaTexto etiqueta="Respuesta" valor={respuesta.respuesta} onCambiar={(texto) => cambiar(indice, { respuesta: texto })} />
          <div>
            <button type="button" className="boton boton--enlace boton--chico" onClick={() => editar((p) => ({ ...p, respuestas: quitar(p.respuestas, indice) }))}>
              Quitar
            </button>
          </div>
        </div>
      ))}
      <div>
        <button
          type="button"
          className="boton boton--enlace"
          onClick={() => editar((p) => ({ ...p, respuestas: [...p.respuestas, { pregunta: "", respuesta: "" }] }))}
        >
          + Agregar pregunta
        </button>
      </div>
    </Seccion>
  );
}
