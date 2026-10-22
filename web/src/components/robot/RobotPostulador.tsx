import { useEffect, useRef, useState } from "react";
import { obtenerOferta } from "../../api/ofertasApi";
import { finalDePostulacion, POSES, type Pose, textoGlobo } from "../../domain/robot";
import { usePostulador } from "../../hooks/usePostulador";
import { useSonido } from "../../hooks/useSonido";
import { AnimadorRobot } from "./animador";

/**
 * El robot que camina por el borde del encabezado mientras el postulador trabaja.
 * Va por encima de las pestañas pero no las bloquea: los clics pasan a través (pointer-events: none),
 * salvo el "!" de una postulación bloqueada, que lleva a Seguimiento.
 *
 * Sigue al postulador real: cuando cambia la oferta en curso, mira cómo terminó la anterior
 * (postulada, bloqueada o devuelta) y empieza la siguiente. La pila de cajas de la esquina crece con las ofertas
 * que esperan (4 de base + hasta 6). Con nada que hacer descansa, toca la flauta y ordena las cajas que le desordenen.
 */
export function RobotPostulador({ onVerBloqueada }: { onVerBloqueada: () => void }) {
  const { estado } = usePostulador();
  const { prendido } = useSonido();
  const sonidoAlMontar = useRef(prendido);
  const carril = useRef<HTMLDivElement>(null);
  const buzon = useRef<SVGSVGElement>(null);
  const robot = useRef<HTMLDivElement>(null);
  const cuerpo = useRef<HTMLDivElement>(null);
  const imagenes = useRef<Partial<Record<Pose, HTMLImageElement>>>({});
  const animador = useRef<AnimadorRobot | null>(null);
  const [bloqueado, setBloqueado] = useState(false);
  const [ahora, setAhora] = useState(() => new Date());

  // El animador se arma una vez, cuando ya existen las imágenes.
  useEffect(() => {
    if (!carril.current || !robot.current || !cuerpo.current || !buzon.current) return;
    const nuevo = new AnimadorRobot({
      carril: carril.current,
      encabezado: carril.current.parentElement ?? carril.current,
      buzon: buzon.current,
      robot: robot.current,
      cuerpo: cuerpo.current,
      imagenes: imagenes.current as Record<Pose, HTMLImageElement>,
      alBloquear: setBloqueado,
    });
    animador.current = nuevo;
    nuevo.fijarSonido(sonidoAlMontar.current);
    const alCambiarTamano = () => nuevo.reacomodar();
    window.addEventListener("resize", alCambiarTamano);
    return () => {
      window.removeEventListener("resize", alCambiarTamano);
      nuevo.destruir();
      animador.current = null;
    };
  }, []);

  // El sonido arranca apagado; el botón del encabezado lo prende y lo apaga.
  useEffect(() => {
    animador.current?.fijarSonido(prendido);
  }, [prendido]);

  // Cada cambio de la oferta en curso es una escena: termina la anterior (si había) y arranca la nueva.
  // Todo pasa por la misma cadena para que el robot se entere en orden (y con la oferta ya resuelta).
  const hayEstado = estado !== undefined;
  const idEnCurso = estado?.enCurso?.id ?? null;
  const enFila = estado?.enFila ?? 0;
  const idAnterior = useRef<number | null>(null);
  const cadena = useRef<Promise<void>>(Promise.resolve());
  useEffect(() => {
    if (!hayEstado) return;
    const anterior = idAnterior.current;
    const cambio = anterior !== idEnCurso;
    idAnterior.current = idEnCurso;
    cadena.current = cadena.current.then(async () => {
      if (cambio) {
        if (anterior !== null) {
          const oferta = await obtenerOferta(anterior).catch(() => null);
          animador.current?.fin(finalDePostulacion(oferta));
        }
        if (idEnCurso !== null) animador.current?.inicio();
      }
      animador.current?.fijarFila(enFila);
    });
  }, [hayEstado, idEnCurso, enFila]);

  // Los minutos del globito ("Postulando a X… 4 min").
  useEffect(() => {
    if (idEnCurso === null) return;
    const reloj = setInterval(() => setAhora(new Date()), 30000);
    return () => clearInterval(reloj);
  }, [idEnCurso]);

  return (
    <div className="robot-carril" ref={carril}>
      {/* El buzón donde entrega las postulaciones */}
      <svg className="robot-carril__buzon" ref={buzon} viewBox="0 0 34 46" aria-hidden="true">
        <path d="M4 22a9 9 0 0 1 18 0v8H4z" />
        <path d="M13 13h12a8 8 0 0 1 8 8v9H22" />
        <path d="M13 46V30" />
        <path className="robot-carril__bandera" d="M26 21V8l6 3-6 3" />
      </svg>

      <div className="robot" ref={robot}>
        {estado?.enCurso && (
          <p className="robot__globo" role="status">
            {textoGlobo(estado.enCurso.empresa, estado.enCurso.desde, ahora)}
          </p>
        )}
        <div className="robot__cuerpo" ref={cuerpo} aria-hidden="true">
          {POSES.map((pose) => (
            <img
              key={pose}
              className="robot__pose"
              src={`/robot/${pose}.webp`}
              alt=""
              decoding="async"
              ref={(img) => {
                if (img) imagenes.current[pose] = img;
              }}
            />
          ))}
        </div>
        {/* El engranaje gira mientras trabaja */}
        <svg className="robot__engranaje" viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" />
        </svg>
        {bloqueado && (
          <button
            type="button"
            className="robot__alerta"
            aria-label="Una postulación se bloqueó: ver el motivo en Seguimiento"
            onClick={() => {
              animador.current?.soltar();
              onVerBloqueada();
            }}
          >
            !
          </button>
        )}
      </div>
    </div>
  );
}
