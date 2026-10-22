import {
  ALTO_BASE,
  ANTES_DEL_BORDE,
  CASA,
  cajasExtra,
  desfaseDePose,
  enojar,
  ESPERA_FLAUTA,
  ESPERA_ORDENAR,
  ESPERA_ORDENAR_CON_FLAUTA,
  type FinalRobot,
  INCLINACION_GRADOS,
  MS_BLOQUEADO,
  MS_INCLINADA,
  MS_TEMBLOR,
  type Paciencia,
  pacienciaIntacta,
  type Pose,
  PX_POR_CICLO,
  recuperarPaciencia,
  seAcaboLaPaciencia,
  SERIES,
  VELOCIDAD,
} from "../../domain/robot";
import { type Caja, CajasFisicas, volarCaja } from "./cajas";
import { Sonido } from "./sonido";

interface Elementos {
  /** El carril: todo el ancho del encabezado. Adentro viven las cajas, las notitas y los saltos de las cajas. */
  carril: HTMLElement;
  /** El encabezado entero: recibe el mouse y el dedo para arrastrar cajas. */
  encabezado: HTMLElement;
  /** El robot entero (se mueve en horizontal). */
  robot: HTMLElement;
  /** Donde están las imágenes de cada pose (se espeja para caminar hacia la izquierda). */
  cuerpo: HTMLElement;
  /** El buzón donde entrega las postulaciones. */
  buzon: SVGSVGElement;
  /** Una imagen por pose, ya cargada. */
  imagenes: Record<Pose, HTMLImageElement>;
  /** Avisa cuándo mostrar u ocultar el "!" (lo dibuja React). */
  alBloquear: (bloqueado: boolean) => void;
}

interface Animacion {
  cuadros: Pose[];
  fps: number;
  repetir: boolean;
  alCuadro?: (i: number) => void;
  t: number;
  ultimo: number;
  listo: () => void;
}

interface Caminata {
  desde: number;
  destino: number;
  cuadros: Pose[];
  recorrido: number;
  listo: () => void;
}

/** Un golpe o un enojo: interrumpe lo que esté haciendo y después lo retoma donde quedó. */
interface Golpe {
  cuadros: Pose[];
  fps: number;
  t: number;
  espejoAntes: boolean;
  despues?: () => void;
}

type EstadoFlauta = null | "sacando" | "tocando" | "guardando";

const INTENTOS_POR_CAJA = 3;
const VUELTAS_MAXIMAS = 15;

/**
 * Mueve al robot del encabezado y a sus cajas. Es código "a mano" (sin React) porque cambia la posición 60 veces
 * por segundo: hacerlo con estado de React redibujaría la pantalla en cada cuadro.
 *
 * Lo que sabe del postulador real le llega por `inicio` (empezó a postular una oferta), `fin` (terminó, y cómo)
 * y `fijarFila` (cuántas esperan). Las escenas se encadenan en orden (`inicio` → `fin` → `inicio`...): si una
 * postulación termina mientras el robot todavía camina, el final espera a que llegue.
 * Mientras no hay trabajo descansa, saca la flauta, y si nadie toca las cajas por un rato las ordena.
 */
export class AnimadorRobot {
  private x = CASA;
  private poseActual: Pose | null = null;
  private animacion: Animacion | null = null;
  private caminata: Caminata | null = null;
  private golpe: Golpe | null = null;
  private llevaCaja = false;
  /** La caja que lleva es de una oferta (no una de base): cuenta como una de la fila. */
  private manoDeOferta = false;
  private sinInterrupcion = false;
  private molestoPendiente = false;
  /** Cuántos píxeles de la imagen (de 360 de alto) se corre el robot para que los pies no salten en el berrinche. */
  private desfase = 0;

  // ---- El berrinche ----
  private paciencia: Paciencia = pacienciaIntacta(Date.now());
  private enBerrinche = false;
  /** El berrinche cortó el orden en curso. */
  private cortarOrden = false;
  /** Tras un berrinche, cuando termina de ordenar se sacude las manos. */
  private trasBerrinche = false;
  private temblor: Animation | null = null;

  private cadena: Promise<void> = Promise.resolve();
  private escenasPendientes = 0;
  private enCurso = false;
  private enFila = 0;
  private soltarBloqueo: (() => void) | null = null;

  private flauta: EstadoFlauta = null;
  private reposoDesde = Date.now();
  private ordenando = false;

  private vivo = true;
  private previo = performance.now();
  private cuadroPendiente = 0;
  private relojOrden: ReturnType<typeof setInterval>;
  private relojFlauta: ReturnType<typeof setInterval>;
  private relojPaciencia: ReturnType<typeof setInterval>;
  private relojNotas: ReturnType<typeof setInterval> | null = null;
  private readonly temporizadores = new Set<ReturnType<typeof setTimeout>>();
  private readonly el: Elementos;
  private readonly cajas: CajasFisicas;
  private readonly sonido = new Sonido();

  constructor(elementos: Elementos) {
    this.el = elementos;
    this.cajas = new CajasFisicas({
      carril: elementos.carril,
      encabezado: elementos.encabezado,
      alGolpear: (desdeX) => this.golpear(desdeX),
      alAgarrar: () => {
        if (this.ordenando) this.molestar();
      },
      quieto: () => this.quieto(),
      escala: () => this.escala(),
    });
    this.mostrar(SERIES.respirar[0]);
    this.descansar();
    this.ubicar();
    this.cuadroPendiente = requestAnimationFrame(this.tic);
    this.relojOrden = setInterval(() => this.revisarOrden(), 500);
    this.relojFlauta = setInterval(() => this.revisarFlauta(), 400);
    // sin enojos por un rato, la paciencia vuelve de a poco
    this.relojPaciencia = setInterval(() => {
      this.paciencia = recuperarPaciencia(this.paciencia, Date.now());
    }, 1000);
  }

  // ---- Lo que le dice el postulador ----
  /** Empezó a postular una oferta: recoge la caja de la pila, camina a la mitad y se pone a pensar. */
  inicio() {
    this.enCurso = true;
    this.trasBerrinche = false; // con trabajo por delante ya no se sacude las manos
    this.escenasPendientes++;
    this.encolar(async () => {
      await this.guardarFlauta();
      const caja = this.cajas.masCercanaA(this.x);
      this.mirar(caja ? caja.cuerpo.position.x < this.x : false);
      this.sinInterrupcion = true;
      await this.reproducir(SERIES.recoger, 12, {
        alCuadro: (i) => {
          if (i !== 4) return;
          this.llevaCaja = true;
          this.manoDeOferta = true;
          if (caja && this.cajas.cajas.includes(caja)) this.cajas.quitar(caja);
        },
      });
      this.sinInterrupcion = false;
      await this.caminar(this.mitad(), SERIES.caja);
      this.el.robot.classList.add("robot--trabajando");
      void this.reproducir(SERIES.pensar, 12, { repetir: true });
    }, () => this.escenasPendientes--);
  }

  /**
   * Terminó: entrega en el buzón y salta, se hace un cortocircuito con el "!", o devuelve la caja a la pila.
   * Después vuelve a la esquina a descansar.
   */
  fin(final: FinalRobot) {
    this.enCurso = false;
    this.escenasPendientes++;
    this.encolar(async () => {
      this.el.robot.classList.remove("robot--trabajando");
      if (final === "postulada") await this.escenaPostulada();
      else if (final === "bloqueada") await this.escenaBloqueada();
      else await this.escenaDevuelta();
      this.descansar();
    }, () => this.escenasPendientes--);
  }

  /** Cuántas ofertas esperan: la pila crece con ellas (4 de base + hasta 6). */
  fijarFila(enFila: number) {
    this.enFila = enFila;
    const faltan = this.cajasQueDeberiaHaber() - this.cajasDeOfertas();
    if (faltan > 0) this.cajas.agregarOfertas(faltan);
  }

  fijarSonido(prendido: boolean) {
    this.sonido.fijar(prendido);
  }

  /** Tocaron el "!": deja de esperar y vuelve a la esquina. */
  soltar() {
    this.soltarBloqueo?.();
  }

  /** Si cambió el ancho de la ventana, el robot y las paredes se reacomodan. */
  reacomodar() {
    this.cajas.acomodarParedes();
    this.x = Math.min(this.x, this.meta());
    this.ubicar();
  }

  /** Para todo: el bucle, los relojes, los eventos, las cajas y el sonido. */
  destruir() {
    this.vivo = false;
    cancelAnimationFrame(this.cuadroPendiente);
    clearInterval(this.relojOrden);
    clearInterval(this.relojFlauta);
    clearInterval(this.relojPaciencia);
    this.pararNotas();
    for (const t of this.temporizadores) clearTimeout(t);
    this.temporizadores.clear();
    this.soltarBloqueo?.();
    this.cajas.destruir();
    this.sonido.destruir();
    this.el.carril.querySelectorAll(".nota-musical, .caja-voladora").forEach((n) => n.remove());
    this.el.robot.classList.remove("robot--trabajando", "robot--saltando", "robot--golpeado", "robot--berrinche");
    this.enderezarRaiz(); // si se desmonta a mitad del berrinche, la página no puede quedar inclinada
  }

  // ---- Las escenas del final ----
  private async escenaPostulada() {
    await this.caminar(this.meta(), SERIES.caja);
    this.sinInterrupcion = true;
    await this.reproducir(SERIES.entregar, 12, {
      alCuadro: (i) => {
        if (i !== 4) return;
        this.llevaCaja = false;
        this.manoDeOferta = false;
        this.volarAlBuzon();
      },
    });
    this.mostrar("salto");
    if (!this.quieto()) this.el.robot.classList.add("robot--saltando");
    await this.esperar(950);
    this.el.robot.classList.remove("robot--saltando");
    this.sinInterrupcion = false;
    await this.caminar(CASA, SERIES.caminar);
  }

  private async escenaBloqueada() {
    this.sinInterrupcion = true;
    await this.reproducir(SERIES.corto, 12, { alCuadro: (i) => this.sonido.sonarCorto(i) });
    this.sonido.cerrarCorto();
    this.llevaCaja = false;
    this.manoDeOferta = false;
    this.sinInterrupcion = false;
    this.sonido.ohOh();
    const brasa = this.sonido.brasas();
    void this.reproducir(SERIES.preocupado, 10, {
      repetir: true,
      alCuadro: () => {
        if (brasa && !brasa.cerrado) this.sonido.chisporrotear(brasa);
      },
    });
    this.el.alBloquear(true);
    await Promise.race([this.esperar(MS_BLOQUEADO), new Promise<void>((listo) => (this.soltarBloqueo = listo))]);
    this.soltarBloqueo = null;
    this.el.alBloquear(false);
    brasa?.cerrar(0.4);
    await this.caminar(CASA, SERIES.caminar);
  }

  private async escenaDevuelta() {
    await this.caminar(CASA, SERIES.caja);
    this.mirar(true);
    this.sinInterrupcion = true;
    await this.reproducir([...SERIES.recoger].reverse(), 12, {
      alCuadro: (i) => {
        if (i !== 4) return;
        this.llevaCaja = false;
        this.manoDeOferta = false;
        this.cajas.devolver(this.x);
      },
    });
    this.sinInterrupcion = false;
  }

  /** La caja sale de las manos en un arco y cae dentro del buzón (la bandera se mueve). */
  private volarAlBuzon() {
    const desde = { x: this.x + 14 * this.escala(), y: this.alto() - 52 * this.escala() };
    const b = this.el.buzon.getBoundingClientRect();
    const c = this.el.carril.getBoundingClientRect();
    const hasta = { x: b.left - c.left + 6, y: b.top - c.top + 14 };
    void volarCaja(
      this.el.carril,
      [
        { transform: `translate(${desde.x}px, ${desde.y}px) rotate(0deg) scale(1)` },
        { transform: `translate(${(desde.x + hasta.x) / 2}px, ${Math.min(desde.y, hasta.y) - 28}px) rotate(-90deg) scale(0.9)`, offset: 0.55 },
        { transform: `translate(${hasta.x}px, ${hasta.y}px) rotate(-180deg) scale(0.3)`, opacity: 0.2 },
      ],
      this.quieto() ? 1 : 520,
      22,
      17,
    ).then(() => {
      if (!this.vivo) return;
      this.el.buzon.classList.remove("recibio");
      void this.el.buzon.getBBox();
      this.el.buzon.classList.add("recibio");
    });
  }

  // ---- El motor: un reproductor de cuadros + caminata ----
  private readonly tic = (ahora: number) => {
    if (!this.vivo) return;
    // el primer cuadro puede traer una hora anterior a `previo`: con dt negativo pedía un cuadro inexistente y se caía el bucle
    const dt = Math.max(0, Math.min(0.05, (ahora - this.previo) / 1000));
    this.previo = ahora;
    if (!this.golpe && this.molestoPendiente && !this.sinInterrupcion) {
      this.molestoPendiente = false;
      this.molestar();
    }
    if (this.golpe) this.avanzarGolpe(dt);
    else if (this.caminata) this.avanzarCaminata(dt);
    else if (this.animacion) this.avanzarAnimacion(dt);
    this.ubicar();
    this.cajas.actualizar(dt * 1000, this.x);
    this.cuadroPendiente = requestAnimationFrame(this.tic);
  };

  private avanzarGolpe(dt: number) {
    const g = this.golpe;
    if (!g) return;
    g.t += dt;
    const i = Math.floor(g.t * g.fps);
    if (i < g.cuadros.length) return this.mostrar(g.cuadros[i]);
    this.mirar(g.espejoAntes);
    this.el.robot.classList.remove("robot--golpeado");
    this.golpe = null;
    if (this.animacion) this.animacion.ultimo = -1;
    g.despues?.();
  }

  private avanzarCaminata(dt: number) {
    const c = this.caminata;
    if (!c) return;
    const total = Math.abs(c.destino - c.desde);
    const hecho = Math.abs(this.x - c.desde);
    const falta = Math.abs(c.destino - this.x);
    // arranca y frena despacio
    const v = VELOCIDAD * Math.max(0.3, Math.min(1, hecho / 28 + 0.3, falta / 28 + 0.15));
    const paso = Math.min(falta, v * dt);
    this.x += Math.sign(c.destino - this.x) * paso;
    c.recorrido += paso;
    this.mostrar(c.cuadros[Math.floor(c.recorrido / ((PX_POR_CICLO * this.escala()) / c.cuadros.length)) % c.cuadros.length]);
    if (falta - paso < 0.5 || total === 0) {
      this.x = c.destino;
      this.caminata = null;
      c.listo();
    }
  }

  private avanzarAnimacion(dt: number) {
    const a = this.animacion;
    if (!a) return;
    a.t += dt;
    let i = Math.floor(a.t * a.fps);
    if (!a.repetir && i >= a.cuadros.length) {
      i = a.cuadros.length - 1;
      this.animacion = null;
      this.mostrar(a.cuadros[i]);
      a.listo();
      return;
    }
    if (i !== a.ultimo) {
      a.ultimo = i;
      a.alCuadro?.(i % a.cuadros.length);
    }
    this.mostrar(a.cuadros[i % a.cuadros.length]);
  }

  /** Reproduce una serie de cuadros. Sin `repetir`, la promesa se cumple al terminar. */
  private reproducir(cuadros: Pose[], fps: number, { repetir = false, alCuadro }: { repetir?: boolean; alCuadro?: (i: number) => void } = {}) {
    return new Promise<void>((listo) => {
      this.animacion = { cuadros, fps, repetir, alCuadro, t: 0, ultimo: -1, listo };
    });
  }

  /** Camina hasta `destino`: el cuadro depende de cuánto avanzó (no del reloj). Con "menos movimiento", aparece allá. */
  private caminar(destino: number, cuadros: Pose[]) {
    this.animacion = null;
    this.mirar(destino < this.x);
    if (this.quieto()) {
      this.x = destino;
      this.mostrar(cuadros[0]);
      return this.esperar(300);
    }
    return new Promise<void>((listo) => {
      this.caminata = { desde: this.x, destino, cuadros, recorrido: 0, listo };
    });
  }

  private mostrar(pose: Pose) {
    if (this.poseActual === pose) return;
    const nueva = this.el.imagenes[pose];
    if (!nueva) return;
    if (this.poseActual) this.el.imagenes[this.poseActual]?.classList.remove("robot__pose--activa");
    nueva.classList.add("robot__pose--activa");
    this.poseActual = pose;
    this.desfase = desfaseDePose(pose);
  }

  private mirar(izquierda: boolean) {
    this.el.cuerpo.classList.toggle("robot__cuerpo--espejo", izquierda);
  }

  private ubicar() {
    const corrido = (this.desfase * this.el.robot.offsetHeight) / 360;
    this.el.robot.style.transform = `translateX(${this.x - this.el.robot.offsetWidth / 2 - corrido}px)`;
  }

  private esperar(ms: number) {
    return new Promise<void>((listo) => {
      const t = setTimeout(() => {
        this.temporizadores.delete(t);
        listo();
      }, ms);
      this.temporizadores.add(t);
    });
  }

  private quieto() {
    return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
  }

  private escala = () => this.el.robot.offsetHeight / ALTO_BASE || 1;
  private ancho = () => this.el.carril.clientWidth;
  private alto = () => this.el.carril.clientHeight;
  private mitad = () => this.ancho() / 2;
  private meta = () => Math.max(CASA, this.ancho() - ANTES_DEL_BORDE);

  private encolar(escena: () => Promise<void>, alTerminar?: () => void) {
    this.cadena = this.cadena
      .then(() => (this.vivo ? escena() : undefined))
      .catch((error) => console.error(error))
      .finally(() => alTerminar?.());
  }

  private descansar() {
    this.mirar(false);
    this.reposoDesde = Date.now();
    void this.reproducir(SERIES.respirar, 8, { repetir: true });
  }

  /**
   * Libre = sin postular, sin escenas por hacer y sin estar en medio de un golpe o un berrinche.
   * Las ofertas en fila no cuentan: pueden esperar horas (por ejemplo, con el tope del día) y el robot descansa igual.
   */
  private libre() {
    return !this.enCurso && this.escenasPendientes === 0 && !this.golpe && !this.enBerrinche;
  }

  // ---- Golpe y enojo ----
  /** Una caja le pegó viniendo desde `desdeX`: se da vuelta, recibe el golpe y vuelve a lo suyo. */
  private golpear(desdeX: number) {
    if (this.golpe || this.sinInterrupcion || this.quieto()) return;
    const espejoAntes = this.el.cuerpo.classList.contains("robot__cuerpo--espejo");
    this.mirar(desdeX < this.x); // se da vuelta hacia donde vino la caja y el golpe lo empuja para atrás
    const tocaba = this.flauta === "tocando";
    if (tocaba) {
      this.pararNotas();
      this.sonido.pedirMusica(false);
      this.flauta = null; // del susto se le corta la melodía
    }
    this.golpe = {
      cuadros: this.llevaCaja ? SERIES.golpeCaja : SERIES.golpe,
      fps: 14,
      t: 0,
      espejoAntes,
      despues: this.ordenando ? () => this.molestar() : tocaba ? () => this.descansar() : undefined,
    };
    this.el.robot.classList.remove("robot--golpeado");
    void this.el.robot.offsetWidth; // reinicia la sacudida si ya estaba puesta
    this.el.robot.classList.add("robot--golpeado");
    this.sonido.sonarGolpe();
  }

  /** Se molesta si le desordenan las cajas mientras ordena (si justo está agachado, espera a terminar). */
  private molestar() {
    if (this.golpe || this.enBerrinche || this.quieto()) return;
    if (this.sinInterrupcion) {
      this.molestoPendiente = true;
      return;
    }
    this.paciencia = enojar(this.paciencia, Date.now());
    const revienta = seAcaboLaPaciencia(this.paciencia);
    this.golpe = {
      cuadros: this.llevaCaja ? SERIES.molestoCaja : SERIES.molesto,
      fps: 12,
      t: 0,
      espejoAntes: this.el.cuerpo.classList.contains("robot__cuerpo--espejo"),
      despues: revienta ? () => this.berrinche() : undefined,
    };
    this.sonido.sonarEnojo();
  }

  // ---- El berrinche: se agarra del suelo, la página se inclina y las cajas se deslizan a la esquina ----
  /**
   * Se le acabó la paciencia: corta el orden en curso, hace el berrinche y después vuelve a ordenar lo que desparramó.
   * Si justo llegó trabajo del postulador, no hace berrinche (la postulación va primero).
   */
  private berrinche() {
    this.paciencia = pacienciaIntacta(Date.now());
    if (!this.vivo || this.enCurso || this.escenasPendientes > 0) return;
    this.enBerrinche = true;
    this.cortarOrden = true;
    if (this.caminata) {
      // si venía caminando, el orden se corta ahí
      const c = this.caminata;
      this.caminata = null;
      c.listo();
    }
    this.encolar(async () => {
      await this.guardarFlauta();
      this.llevaCaja = false;
      this.mirar(false); // el cuerpo de los cuadros ya mira a la izquierda
      this.sinInterrupcion = true;
      this.cajas.robotSinChoque(true); // las cajas pasan sin chocar con él mientras se deslizan (y por detrás)
      this.el.robot.classList.add("robot--berrinche");
      let inclinada: Promise<void> | null = null;
      await this.reproducir(SERIES.berrinche.slice(0, 24), 12, {
        alCuadro: (i) => {
          this.sonido.sonarBerrinche(i);
          if (i === 20) inclinada = this.inclinarPagina();
        },
      });
      // bucle mientras dura la inclinación
      void this.reproducir(SERIES.berrinche.slice(24), 12, { repetir: true, alCuadro: (i) => this.sonido.sonarBerrinche(24 + i) });
      await (inclinada ?? this.inclinarPagina());
      this.sonido.cerrarBerrinche();
      await Promise.all([this.reproducir(SERIES.soltarBorde, 12), this.enderezarPagina()]);
      this.cajas.sacarDelRobot(this.x);
      this.cajas.robotSinChoque(false);
      this.el.robot.classList.remove("robot--berrinche");
      this.sinInterrupcion = false;
      this.enBerrinche = false;
      this.trasBerrinche = true;
      this.cajas.olvidarRendidas();
      this.descansar();
      await this.esperar(1200); // las cajas terminan de asentarse
      this.cajas.ultimoToque = Date.now();
      this.ordenar();
    }, () => {
      this.enBerrinche = false;
    });
  }

  /** Sacudida corta, las cajas saltan y después toda la página gira; dura MS_TEMBLOR + MS_INCLINADA. Con "menos movimiento" no se mueve nada. */
  private async inclinarPagina() {
    if (!this.quieto()) {
      this.sonido.sonarRetumbe(true);
      this.cajas.saltarTodas();
      if (typeof document.body.animate === "function") {
        this.temblor = document.body.animate(
          [{ translate: "0 0" }, { translate: "-4px 2px" }, { translate: "3px -2px" }, { translate: "-3px 1px" }, { translate: "2px -1px" }, { translate: "0 0" }],
          { duration: MS_TEMBLOR, easing: "linear" },
        );
      }
      await this.esperar(MS_TEMBLOR);
      if (!this.vivo) return;
      // la raíz de la página gira (el lado izquierdo baja) y sin barras de desplazamiento mientras dure
      document.documentElement.classList.add("inclinada");
      document.body.style.rotate = `-${INCLINACION_GRADOS}deg`;
      this.cajas.torcerGravedad();
    }
    await this.esperar(MS_INCLINADA);
  }

  /** La página vuelve derecha y la física a la normal. */
  private enderezarPagina() {
    this.sonido.sonarRetumbe(false);
    this.cajas.enderezar();
    document.body.style.rotate = "";
    return this.esperar(600).then(() => document.documentElement.classList.remove("inclinada"));
  }

  /** Deja la página como estaba, de golpe (al desmontar). */
  private enderezarRaiz() {
    this.temblor?.cancel();
    this.temblor = null;
    document.body.style.rotate = "";
    document.documentElement.classList.remove("inclinada");
  }

  /** Solo tras un berrinche, cuando termina de ordenar: se sacude las manos satisfecho. */
  private async sacudirManos() {
    this.trasBerrinche = false;
    this.mirar(false);
    this.sinInterrupcion = true;
    await this.reproducir(SERIES.sacudirManos, 12, {
      alCuadro: (i) => {
        if (i === 2) this.sonido.sonarSatisfecho();
      },
    });
    this.sinInterrupcion = false;
    this.descansar();
  }

  // ---- Cuántas cajas ----
  private cajasDeOfertas() {
    return this.cajas.extras() + (this.manoDeOferta ? 1 : 0);
  }

  /** Una caja por oferta que espera, más la que está por recoger si ya empezó a postular. */
  private cajasQueDeberiaHaber() {
    return cajasExtra(this.enFila + (this.enCurso && !this.manoDeOferta ? 1 : 0));
  }

  // ---- Ordenar las cajas ----
  private revisarOrden() {
    if (this.ordenando || this.enBerrinche || this.enCurso || this.escenasPendientes > 0 || this.golpe) return;
    // si la fila bajó por otro lado (se descartó una oferta), sobra una caja: se retira
    if (this.cajasDeOfertas() > this.cajasQueDeberiaHaber() && this.cajas.quitarSobrante()) return;
    const espera = this.flauta === "tocando" ? ESPERA_ORDENAR_CON_FLAUTA : ESPERA_ORDENAR;
    if (this.libre() && Date.now() - this.cajas.ultimoToque > espera && this.cajas.desordenadas().length) this.ordenar();
  }

  private ordenar() {
    this.ordenando = true;
    this.encolar(async () => {
      this.cortarOrden = false;
      if (!this.libre() || this.cajas.desordenadas().length === 0) {
        if (this.trasBerrinche && this.libre()) await this.sacudirManos(); // ya estaba todo en orden
        return;
      }
      await this.guardarFlauta();
      const intentos = new Map<Caja, number>();
      let vueltas = 0;
      while (!this.enCurso && this.escenasPendientes === 0 && !this.cortarOrden && vueltas++ < VUELTAS_MAXIMAS) {
        const caja = this.proximaADesordenar(intentos);
        if (!caja) break;
        intentos.set(caja, (intentos.get(caja) ?? 0) + 1);
        await this.ordenarUna(caja);
      }
      if (this.cortarOrden) {
        // berrinche: la caja que tenía en la mano vuelve a la pila y sigue la otra escena
        if (this.llevaCaja) {
          const base = !this.manoDeOferta;
          this.llevaCaja = false;
          this.manoDeOferta = false;
          this.cajas.dejarEnColumna(base, this.x);
        }
        return;
      }
      if (this.enCurso || this.escenasPendientes > 0) return; // llegó trabajo: el orden sigue después
      // las que no pudo acomodar (3 intentos, o se acabó el tope de vueltas) se recuerdan con su posición y no se reintentan
      const tope = vueltas > VUELTAS_MAXIMAS;
      for (const c of this.cajas.desordenadas()) if (tope || (intentos.get(c) ?? 0) >= INTENTOS_POR_CAJA) this.cajas.rendirse(c);
      if (this.trasBerrinche) await this.sacudirManos();
      this.descansar();
    }, () => {
      this.ordenando = false;
    });
  }

  /** Primero la de más arriba (así no le tira encima a las de abajo), y entre iguales la más cercana. */
  private proximaADesordenar(intentos: Map<Caja, number>): Caja | undefined {
    return this.cajas
      .desordenadas()
      .filter((c) => (intentos.get(c) ?? 0) < INTENTOS_POR_CAJA)
      .sort((a, b) => a.cuerpo.position.y - b.cuerpo.position.y || Math.abs(a.cuerpo.position.x - this.x) - Math.abs(b.cuerpo.position.x - this.x))[0];
  }

  /** Va a la caja, la levanta, la lleva a la esquina y la deja arriba de la columna más baja. */
  private async ordenarUna(caja: Caja) {
    // se para al costado de la caja (sin meterse en la pila de la esquina)
    const lado = caja.cuerpo.position.x < this.x ? 1 : -1;
    const destino = Math.min(this.ancho() - 20, Math.max(CASA, caja.cuerpo.position.x + lado * 32 * this.escala()));
    await this.caminar(destino, SERIES.caminar);
    if (this.cortarOrden) return;
    // si se la movieron (la agarraron, o se alejó), prueba con la siguiente
    if (!this.cajas.cajas.includes(caja) || this.cajas.estaAgarrada(caja) || Math.abs(caja.cuerpo.position.x - this.x) > 70 * this.escala()) return;
    this.mirar(caja.cuerpo.position.x < this.x);
    this.sinInterrupcion = true;
    const base = caja.base;
    await this.reproducir(SERIES.recoger, 12, {
      alCuadro: (i) => {
        if (i !== 4) return;
        this.llevaCaja = true;
        this.manoDeOferta = !caja.base;
        if (this.cajas.cajas.includes(caja)) this.cajas.quitar(caja);
      },
    });
    this.sinInterrupcion = false;
    await this.caminar(CASA, SERIES.caja);
    if (this.cortarOrden) return;
    this.mirar(true);
    this.sinInterrupcion = true;
    await this.reproducir([...SERIES.recoger].reverse(), 12, {
      alCuadro: (i) => {
        if (i !== 4) return;
        this.llevaCaja = false;
        this.manoDeOferta = false;
        this.cajas.dejarEnColumna(base, this.x);
      },
    });
    this.sinInterrupcion = false;
  }

  // ---- La flauta: a los 5 segundos de descanso la saca y toca; la guarda si llega trabajo u orden ----
  private revisarFlauta() {
    const a = this.animacion;
    const respirando = a !== null && a.cuadros === SERIES.respirar && !this.caminata && !this.golpe;
    if (!this.flauta && respirando && this.libre() && !this.ordenando && Date.now() - this.reposoDesde > ESPERA_FLAUTA) this.empezarFlauta();
  }

  private empezarFlauta() {
    this.flauta = "sacando";
    this.encolar(async () => {
      if (!this.libre() || this.ordenando) {
        this.flauta = null;
        return;
      }
      this.sinInterrupcion = true;
      await this.reproducir(SERIES.sacarFlauta, 12);
      this.sinInterrupcion = false;
      this.flauta = "tocando";
      void this.reproducir(SERIES.flauta, 10, { repetir: true });
      this.sonido.pedirMusica(true);
      this.empezarNotas();
    });
  }

  private async guardarFlauta() {
    if (this.flauta !== "tocando") return;
    this.sonido.pedirMusica(false);
    this.pararNotas();
    this.flauta = "guardando";
    this.sinInterrupcion = true;
    await this.reproducir([...SERIES.sacarFlauta].reverse(), 14);
    this.sinInterrupcion = false;
    this.flauta = null;
  }

  /** Notitas ♪ que salen de la flauta. */
  private empezarNotas() {
    this.pararNotas();
    if (this.quieto()) return;
    const soltar = () => {
      const n = document.createElement("span");
      n.className = "nota-musical";
      n.textContent = Math.random() < 0.5 ? "♪" : "♫";
      n.style.left = `${this.x + (this.el.cuerpo.classList.contains("robot__cuerpo--espejo") ? -18 : 14) * this.escala()}px`;
      n.style.top = `${this.alto() - 62 * this.escala()}px`;
      n.style.setProperty("--deriva", `${(Math.random() * 24 - 6).toFixed(0)}px`);
      this.el.carril.appendChild(n);
      const t = setTimeout(() => {
        this.temporizadores.delete(t);
        n.remove();
      }, 1900);
      this.temporizadores.add(t);
    };
    soltar();
    this.relojNotas = setInterval(soltar, 900);
  }

  private pararNotas() {
    if (this.relojNotas) clearInterval(this.relojNotas);
    this.relojNotas = null;
  }
}
