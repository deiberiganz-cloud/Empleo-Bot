import { CAMINAR, CAMINAR_CAJA, type FinalRobot, type Pose, TRABAJAR } from "../../domain/robot";

// Valores que quedaron bien en la maqueta.
const VELOCIDAD = 90; // px por segundo
const CUADROS_POR_SEGUNDO = 8;
const MS_POR_POSE_TRABAJANDO = 700;
const MS_BLOQUEADO = 6000; // cuánto espera con el "!" antes de volver (si no lo tocas antes)
const CASA = 60; // la esquina izquierda donde descansa
const ANTES_DEL_BORDE = 87; // dónde entrega la caja, contado desde la derecha

interface Elementos {
  /** El carril: todo el ancho del encabezado. */
  carril: HTMLElement;
  /** El robot entero (se mueve en horizontal). */
  robot: HTMLElement;
  /** Donde están las imágenes de cada pose (se espeja para caminar hacia la izquierda). */
  cuerpo: HTMLElement;
  /** Una imagen por pose, ya cargada. */
  imagenes: Record<Pose, HTMLImageElement>;
  /** Avisa cuándo mostrar u ocultar el "!" (lo dibuja React). */
  alBloquear: (bloqueado: boolean) => void;
}

const esperar = (ms: number) => new Promise<void>((listo) => setTimeout(listo, ms));

/**
 * Mueve al robot del encabezado. Es código "a mano" (sin React) porque cambia la posición 60 veces
 * por segundo: hacerlo con estado de React redibujaría la pantalla en cada cuadro.
 *
 * Las escenas se encadenan en orden (`inicio` → `fin` → `inicio`...): si una postulación termina
 * mientras el robot todavía camina, el final espera a que llegue.
 */
export class AnimadorRobot {
  private x = CASA;
  private poseActual: Pose | null = null;
  private cadena: Promise<void> = Promise.resolve();
  private relojTrabajo: ReturnType<typeof setInterval> | null = null;
  private soltarBloqueo: (() => void) | null = null;
  private vivo = true;
  private readonly el: Elementos;

  constructor(elementos: Elementos) {
    this.el = elementos;
    this.mostrar("parado");
    this.ubicar();
  }

  /** Empezó a postular una oferta: recoge la caja, camina a la mitad y se pone a trabajar. */
  inicio() {
    this.encolar(async () => {
      this.mostrar("parado-caja");
      await esperar(450);
      await this.caminar(this.mitad(), CAMINAR_CAJA);
      this.el.robot.classList.add("robot--trabajando");
      let i = 0;
      this.mostrar(TRABAJAR[0]);
      this.relojTrabajo = setInterval(() => this.mostrar(TRABAJAR[++i % TRABAJAR.length]), MS_POR_POSE_TRABAJANDO);
    });
  }

  /** Terminó: entrega y salta, se preocupa con el "!" o devuelve la caja. Después vuelve a la esquina. */
  fin(final: FinalRobot) {
    this.encolar(async () => {
      this.dejarDeTrabajar();
      if (final === "postulada") {
        await this.caminar(this.meta(), CAMINAR_CAJA);
        this.mostrar("parado-caja");
        await esperar(300);
        this.mostrar("salto");
        if (!this.quieto()) this.el.robot.classList.add("robot--saltando");
        await esperar(1000);
        this.el.robot.classList.remove("robot--saltando");
      } else if (final === "bloqueada") {
        this.mostrar("preocupado");
        this.el.alBloquear(true);
        await Promise.race([esperar(MS_BLOQUEADO), new Promise<void>((listo) => (this.soltarBloqueo = listo))]);
        this.soltarBloqueo = null;
        this.el.alBloquear(false);
      }
      await this.caminar(CASA, final === "postulada" ? CAMINAR : CAMINAR_CAJA);
      this.el.cuerpo.classList.remove("robot__cuerpo--espejo");
      this.mostrar("parado");
    });
  }

  /** Tocaron el "!": deja de esperar y vuelve a la esquina. */
  soltar() {
    this.soltarBloqueo?.();
  }

  /** Si cambió el ancho de la ventana, el robot se reacomoda. */
  reacomodar() {
    this.x = Math.min(this.x, this.meta());
    this.ubicar();
  }

  destruir() {
    this.vivo = false;
    this.dejarDeTrabajar();
    this.soltarBloqueo?.();
  }

  private encolar(escena: () => Promise<void>) {
    this.cadena = this.cadena.then(() => (this.vivo ? escena() : undefined)).catch(() => undefined);
  }

  private dejarDeTrabajar() {
    if (this.relojTrabajo) clearInterval(this.relojTrabajo);
    this.relojTrabajo = null;
    this.el.robot.classList.remove("robot--trabajando");
  }

  private quieto() {
    return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
  }

  private mitad() {
    return this.el.carril.clientWidth / 2;
  }

  private meta() {
    return Math.max(CASA, this.el.carril.clientWidth - ANTES_DEL_BORDE);
  }

  private mostrar(pose: Pose) {
    if (this.poseActual === pose) return;
    if (this.poseActual) this.el.imagenes[this.poseActual].classList.remove("robot__pose--activa");
    this.el.imagenes[pose].classList.add("robot__pose--activa");
    this.poseActual = pose;
  }

  private ubicar() {
    this.el.robot.style.transform = `translateX(${this.x - this.el.robot.offsetWidth / 2}px)`;
  }

  /** Camina hasta `destino` alternando las poses; mira hacia donde va. Con "menos movimiento", aparece allá. */
  private async caminar(destino: number, cuadros: Pose[]) {
    this.el.cuerpo.classList.toggle("robot__cuerpo--espejo", destino < this.x);
    if (this.quieto()) {
      this.mostrar(cuadros[0]);
      this.x = destino;
      this.ubicar();
      await esperar(400);
      return;
    }
    await new Promise<void>((listo) => {
      let previo = performance.now();
      let reloj = 0;
      let cuadro = 0;
      const paso = (ahora: number) => {
        if (!this.vivo) return listo();
        const dt = Math.min(0.1, (ahora - previo) / 1000);
        previo = ahora;
        const avance = VELOCIDAD * dt * Math.sign(destino - this.x);
        this.x = Math.abs(destino - this.x) <= Math.abs(avance) ? destino : this.x + avance;
        reloj += dt;
        if (reloj >= 1 / CUADROS_POR_SEGUNDO) {
          reloj = 0;
          cuadro = (cuadro + 1) % cuadros.length;
        }
        this.mostrar(cuadros[cuadro]);
        this.ubicar();
        if (this.x === destino) listo();
        else requestAnimationFrame(paso);
      };
      requestAnimationFrame(paso);
    });
  }
}
