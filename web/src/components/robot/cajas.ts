import Matter from "matter-js";
import {
  CAJA_ALTO,
  CAJA_ANCHO,
  CAJAS_BASE,
  type CajaMedida,
  CATEGORIA_CAJA,
  CATEGORIA_PARED,
  CATEGORIA_ROBOT,
  columnaMasBaja,
  COLUMNAS,
  ARRASTRE_AMORTIGUACION,
  ARRASTRE_RIGIDEZ,
  CAJA_DENSIDAD,
  CAJA_ROCE_AIRE,
  CURSOR_ACOPLE,
  CURSOR_PASO_MAXIMO,
  CURSOR_VELOCIDAD_EMPUJE,
  CURSOR_VELOCIDAD_MAXIMA,
  dentroDelNucleo,
  estaFueraDeLugar,
  limitarVelocidad,
  pasoDelCursor,
  techoColumna,
  VELOCIDAD_GOLPE,
} from "../../domain/robot";

const { Engine, Bodies, Body, Composite, Mouse, MouseConstraint, Query, Events, Sleeping } = Matter;

const SVG_CAJA =
  '<svg viewBox="0 0 26 20"><rect class="caja-carton" x="0.8" y="0.8" width="24.4" height="18.4" rx="2.5"/><rect class="caja-cinta" x="11" y="1.6" width="4" height="7"/></svg>';
const TRAMO_CURSOR = 4; // cada cuántos px del recorrido se revisa si el puntero entró a una caja
const MS_ENTRE_CAJAS = 250; // cuando llegan varias ofertas juntas, las cajas caen de a una

/** Una caja con física. Las de `base` nunca se las lleva el robot a postular. */
export interface Caja {
  cuerpo: Matter.Body;
  el: HTMLElement;
  base: boolean;
}

interface OpcionesCajas {
  /** Donde viven las cajas (todo el encabezado, en coordenadas locales). */
  carril: HTMLElement;
  /** El encabezado: recibe el mouse y el dedo. */
  encabezado: HTMLElement;
  /** Una caja le pegó al robot, viniendo desde esa posición horizontal. */
  alGolpear: (desdeX: number) => void;
  /** Alguien agarró una caja. */
  alAgarrar: () => void;
  /** Con "menos movimiento" los saltitos de las cajas son instantáneos. */
  quieto: () => boolean;
  /** Qué tan grande se ve el robot respecto de su tamaño base (90 px de alto). */
  escala: () => number;
}

/** Matter guarda sus manejadores de eventos dentro del `Mouse`, pero sus tipos no los declaran. */
interface ManejadoresMouse {
  mousedown: (e: Event) => void;
  mousemove: (e: Event) => void;
  mouseup: (e: Event) => void;
  mousewheel: (e: Event) => void;
}

/**
 * Una animación corta de una caja que vuela por el aire (de las manos al buzón o a la pila).
 * Sin Web Animations (tests) termina al instante. Devuelve cuando llegó.
 */
export async function volarCaja(carril: HTMLElement, frames: Keyframe[], ms: number, ancho = CAJA_ANCHO, alto = CAJA_ALTO): Promise<void> {
  const caja = document.createElement("div");
  caja.className = "caja-voladora";
  caja.innerHTML = SVG_CAJA;
  caja.style.width = `${ancho}px`;
  caja.style.height = `${alto}px`;
  carril.appendChild(caja);
  try {
    if (typeof caja.animate === "function") {
      await caja.animate(frames, { duration: ms, easing: "cubic-bezier(.3,.6,.4,1)", fill: "forwards" }).finished;
    }
  } catch {
    /* animación cancelada (se desmontó el robot) */
  } finally {
    caja.remove();
  }
}

/**
 * Las cajas del encabezado: el motor de física (Matter.js) calcula y los SVG lo siguen.
 * Tiene el robot como un cuerpo fijo que se mueve a mano (empuja las cajas cuando pasa), arrastre con mouse y dedo,
 * y el juicio de cuáles están fuera de lugar. No sabe nada del postulador: el animador le dice qué hacer.
 */
export class CajasFisicas {
  readonly cajas: Caja[] = [];
  /** Cuándo fue la última vez que alguien tocó o agregó una caja (para el orden automático). */
  ultimoToque = Date.now();

  private readonly motor = Engine.create({ gravity: { y: 1.1 }, enableSleeping: true });
  private readonly paredes = [0, 1, 2].map((i) =>
    Bodies.rectangle(0, 0, i < 2 ? 40 : 4000, i < 2 ? 2000 : 40, { isStatic: true, collisionFilter: { category: CATEGORIA_PARED } }),
  );
  private readonly cuerpoRobot = Bodies.rectangle(0, 0, 26, 70, { isStatic: true, chamfer: { radius: 8 }, collisionFilter: { category: CATEGORIA_ROBOT } });
  private readonly mouse: Matter.Mouse & ManejadoresMouse;
  private readonly agarre: Matter.MouseConstraint;
  private readonly rendidas = new WeakMap<Matter.Body, { x: number; y: number }>();
  private readonly temporizadores = new Set<ReturnType<typeof setTimeout>>();
  private readonly limpiezas: (() => void)[] = [];
  private readonly op: OpcionesCajas;
  private vivo = true;
  private porCaer = 0;
  private arrastrandoConDedo = false;
  private punteroDentro = false;
  private cursorActivo = false;
  private objetivoCursor = { x: 0, y: 0 };
  private posCursor = { x: 0, y: 0 };
  private readonly empujando = new Set<Matter.Body>();

  constructor(op: OpcionesCajas) {
    this.op = op;
    Composite.add(this.motor.world, [...this.paredes, this.cuerpoRobot]);
    this.acomodarParedes();

    this.mouse = Mouse.create(op.encabezado) as Matter.Mouse & ManejadoresMouse;
    this.soltarRuedaYScroll();
    this.agarre = MouseConstraint.create(this.motor, { mouse: this.mouse, constraint: { stiffness: ARRASTRE_RIGIDEZ, damping: ARRASTRE_AMORTIGUACION, render: { visible: false } } });
    this.agarre.collisionFilter.mask = CATEGORIA_CAJA; // agarra solo cajas, nunca el robot ni las paredes
    Composite.add(this.motor.world, this.agarre);
    Events.on(this.agarre, "startdrag", () => {
      this.ultimoToque = Date.now();
      op.alAgarrar();
    });
    Events.on(this.agarre, "enddrag", () => {
      this.ultimoToque = Date.now();
    });
    Events.on(this.motor, "collisionStart", (e: Matter.IEventCollision<Matter.Engine>) => this.alChocar(e));
    this.escucharCursor();
    this.escucharPuntero();

    // las 4 de base: 3 apiladas a la izquierda y 1 sola al lado
    for (let i = 0; i < CAJAS_BASE - 1; i++) this.nueva(COLUMNAS[0], this.alto() - CAJA_ALTO / 2 - i * CAJA_ALTO, { base: true, giro: 0 });
    this.nueva(COLUMNAS[1], this.alto() - CAJA_ALTO / 2, { base: true, giro: 0 });
  }

  private ancho = () => this.op.carril.clientWidth;
  private alto = () => this.op.carril.clientHeight;
  private escala = () => this.op.escala();

  /** Cuántas cajas de ofertas hay (las que están en la pila más las que todavía están cayendo). */
  extras(): number {
    return this.cajas.filter((c) => !c.base).length + this.porCaer;
  }

  /** Si cambió el tamaño del encabezado, las paredes se mueven con él. */
  acomodarParedes() {
    Body.setPosition(this.paredes[0], { x: -20, y: this.alto() / 2 });
    Body.setPosition(this.paredes[1], { x: this.ancho() + 20, y: this.alto() / 2 });
    Body.setPosition(this.paredes[2], { x: this.ancho() / 2, y: this.alto() + 20 });
  }

  // ---- Arrastre ----
  /**
   * Sin trabar la rueda del mouse ni el scroll de la página: Matter escucha todo el encabezado y bloquea la rueda
   * y los toques; acá le quitamos eso y solo le pasamos el dedo cuando cae sobre una caja.
   */
  private soltarRuedaYScroll() {
    const { encabezado } = this.op;
    const m = this.mouse;
    for (const ev of ["mousewheel", "DOMMouseScroll", "wheel"]) encabezado.removeEventListener(ev, m.mousewheel);
    encabezado.removeEventListener("touchstart", m.mousedown);
    encabezado.removeEventListener("touchmove", m.mousemove);
    encabezado.removeEventListener("touchend", m.mouseup);

    const puntoDe = (e: TouchEvent) => {
      const r = encabezado.getBoundingClientRect();
      const t = e.touches[0];
      return { x: t.clientX - r.left, y: t.clientY - r.top };
    };
    const alTocar = (e: TouchEvent) => {
      if (Query.point(this.cajas.map((c) => c.cuerpo), puntoDe(e)).length === 0) return;
      this.arrastrandoConDedo = true;
      m.mousedown(e);
    };
    const alMover = (e: TouchEvent) => {
      if (this.arrastrandoConDedo) m.mousemove(e);
    };
    const alSoltarDedo = (e: TouchEvent) => {
      if (!this.arrastrandoConDedo) return;
      this.arrastrandoConDedo = false;
      m.mouseup(e);
    };
    // si sueltan el mouse fuera del encabezado, Matter no se entera y la caja queda pegada al cursor
    const alSoltarFuera = (e: MouseEvent) => {
      if (!(e.target instanceof Node) || !encabezado.contains(e.target)) m.mouseup(e);
    };
    encabezado.addEventListener("touchstart", alTocar, { passive: false });
    encabezado.addEventListener("touchmove", alMover, { passive: false });
    encabezado.addEventListener("touchend", alSoltarDedo);
    window.addEventListener("mouseup", alSoltarFuera);
    this.limpiezas.push(() => {
      encabezado.removeEventListener("touchstart", alTocar);
      encabezado.removeEventListener("touchmove", alMover);
      encabezado.removeEventListener("touchend", alSoltarDedo);
      window.removeEventListener("mouseup", alSoltarFuera);
    });
  }

  /** La manito sobre una caja, y el puño cerrado mientras la arrastran. */
  private escucharCursor() {
    const { encabezado } = this.op;
    const alMover = () => {
      const encima = Query.point(this.cajas.map((c) => c.cuerpo), this.mouse.position).length > 0;
      encabezado.style.cursor = this.agarre.body ? "grabbing" : encima ? "grab" : "";
    };
    encabezado.addEventListener("mousemove", alMover);
    this.limpiezas.push(() => {
      encabezado.removeEventListener("mousemove", alMover);
      encabezado.style.cursor = "";
    });
  }

  /** El mouse (solo mouse, no dedo) dentro del encabezado: ahí vive el cursor que empuja las cajas. */
  private escucharPuntero() {
    const { encabezado } = this.op;
    const seguir = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return;
      const r = encabezado.getBoundingClientRect();
      this.objetivoCursor = { x: e.clientX - r.left, y: e.clientY - r.top };
      this.punteroDentro = true;
    };
    const salir = (e: PointerEvent) => {
      if (e.pointerType === "mouse") this.punteroDentro = false;
    };
    encabezado.addEventListener("pointerenter", seguir);
    encabezado.addEventListener("pointermove", seguir);
    encabezado.addEventListener("pointerleave", salir);
    this.limpiezas.push(() => {
      encabezado.removeEventListener("pointerenter", seguir);
      encabezado.removeEventListener("pointermove", seguir);
      encabezado.removeEventListener("pointerleave", salir);
    });
  }

  /**
   * El cursor no es un cuerpo: es un punto que sigue al mouse y empuja solo las cajas en cuyo núcleo (bien adentro) está.
   * Así el borde queda libre para hacer clic y agarrar. El empuje es una fuerza hacia la velocidad del mouse, con tope.
   */
  private moverCursor(ms: number) {
    const debe = this.punteroDentro && !this.agarre.body;
    if (debe && !this.cursorActivo) this.posCursor = { ...this.objetivoCursor };
    this.cursorActivo = debe;
    if (!debe) {
      this.empujando.clear();
      return;
    }
    const paso = pasoDelCursor(this.posCursor, this.objetivoCursor, CURSOR_PASO_MAXIMO);
    const antes = this.posCursor;
    this.posCursor = { x: antes.x + paso.x, y: antes.y + paso.y };
    const n = Math.ceil(Math.hypot(paso.x, paso.y) / TRAMO_CURSOR);
    const tramo: { x: number; y: number }[] = [];
    for (let i = 1; i <= n; i++) tramo.push({ x: antes.x + (paso.x * i) / n, y: antes.y + (paso.y * i) / n });
    const k = 1000 / 60 / Math.max(1, ms); // Matter mide la velocidad por cada 16,7 ms
    this.empujarCajas(limitarVelocidad({ x: paso.x * k, y: paso.y * k }, CURSOR_VELOCIDAD_MAXIMA), ms, tramo);
  }

  /** Cada caja con el puntero (o su recorrido de este cuadro) en su núcleo recibe una fuerza hacia la velocidad del cursor (en su punto: así también gira). */
  private empujarCajas(v: { x: number; y: number }, ms: number, tramo: { x: number; y: number }[]) {
    const rapido = Math.hypot(v.x, v.y) >= CURSOR_VELOCIDAD_EMPUJE;
    for (const { cuerpo } of this.cajas) {
      const punto = tramo.find((p) => dentroDelNucleo(p, cuerpo.position, cuerpo.angle)); // un barrido rápido no salta la caja
      if (!punto) {
        this.empujando.delete(cuerpo);
        continue;
      }
      if (!rapido) continue;
      Sleeping.set(cuerpo, false);
      const f = (cuerpo.mass * CURSOR_ACOPLE) / (ms * ms);
      Body.applyForce(cuerpo, punto, { x: (v.x - cuerpo.velocity.x) * f, y: (v.y - cuerpo.velocity.y) * f });
      this.ultimoToque = Date.now();
      if (!this.empujando.has(cuerpo)) {
        this.empujando.add(cuerpo);
        this.op.alAgarrar();
      }
    }
  }

  /** Si alguien está sosteniendo esta caja. */
  estaAgarrada(caja: Caja): boolean {
    return this.agarre.body === caja.cuerpo;
  }

  // ---- Choques ----
  private cajaDe(cuerpo: Matter.Body): Caja | undefined {
    return this.cajas.find((c) => c.cuerpo === cuerpo);
  }

  /** Matter avisa cada choque; si una caja llega rápido contra el robot (un tiro, no un roce), lo golpea. */
  private alChocar(e: Matter.IEventCollision<Matter.Engine>) {
    for (const par of e.pairs) {
      const otro = par.bodyA === this.cuerpoRobot ? par.bodyB : par.bodyB === this.cuerpoRobot ? par.bodyA : null;
      if (!otro || !this.cajaDe(otro)) continue; // choques entre cajas: no hacen nada, el orden se juzga por la posición
      if (Math.hypot(otro.velocity.x, otro.velocity.y) >= VELOCIDAD_GOLPE) this.op.alGolpear(otro.position.x);
    }
  }

  // ---- Crear y quitar ----
  private nueva(x: number, y: number, { base = false, giro = (Math.random() - 0.5) * 0.8, vx = 0, vy = 0 } = {}) {
    const cuerpo = Bodies.rectangle(x, y, CAJA_ANCHO, CAJA_ALTO, {
      chamfer: { radius: 3 },
      friction: 0.8,
      frictionStatic: 1.2,
      restitution: 0.1,
      density: CAJA_DENSIDAD,
      frictionAir: CAJA_ROCE_AIRE,
      sleepThreshold: 30,
    });
    Body.setAngle(cuerpo, giro);
    Body.setVelocity(cuerpo, { x: vx, y: vy });
    Body.setAngularVelocity(cuerpo, (Math.random() - 0.5) * 0.15);
    const el = document.createElement("div");
    el.className = "caja-fisica";
    el.innerHTML = SVG_CAJA;
    this.op.carril.appendChild(el);
    Composite.add(this.motor.world, cuerpo);
    this.cajas.push({ cuerpo, el, base });
  }

  private despues(ms: number, accion: () => void) {
    const t = setTimeout(() => {
      this.temporizadores.delete(t);
      accion();
    }, ms);
    this.temporizadores.add(t);
  }

  private medidas(): CajaMedida[] {
    return this.cajas.map((c) => ({ x: c.cuerpo.position.x, y: c.cuerpo.position.y, angulo: c.cuerpo.angle, velocidad: Math.hypot(c.cuerpo.velocity.x, c.cuerpo.velocity.y) }));
  }

  /** Una oferta nueva que espera: cae una caja encima de la columna más baja. Varias juntas caen de a una. */
  agregarOfertas(cantidad: number) {
    for (let i = 0; i < cantidad; i++) {
      this.porCaer++;
      this.despues(i * MS_ENTRE_CAJAS, () => {
        this.porCaer--;
        this.nueva(columnaMasBaja(this.medidas(), this.alto()), -CAJA_ALTO, { giro: (Math.random() - 0.5) * 0.08 });
        this.ultimoToque = Date.now();
      });
    }
  }

  /** Saca una caja del mundo (se la llevó el robot, o sobraba). */
  quitar(caja: Caja) {
    Composite.remove(this.motor.world, caja.cuerpo);
    this.cajas.splice(this.cajas.indexOf(caja), 1);
    caja.el.classList.add("recogida");
    this.despues(250, () => caja.el.remove());
  }

  /** Retira la caja de oferta que está más arriba de la pila (si nadie la sostiene). Devuelve si quitó alguna. */
  quitarSobrante(): boolean {
    const sobrante = this.cajas.filter((c) => !c.base && !this.estaAgarrada(c)).sort((a, b) => a.cuerpo.position.y - b.cuerpo.position.y)[0];
    if (!sobrante) return false;
    this.quitar(sobrante);
    return true;
  }

  /** La caja de oferta más cercana al robot (las 4 de base quedan siempre para jugar). */
  masCercanaA(x: number): Caja | undefined {
    return this.cajas
      .filter((c) => !c.base)
      .sort((a, b) => Math.abs(a.cuerpo.position.x - x) - Math.abs(b.cuerpo.position.x - x) || a.cuerpo.position.y - b.cuerpo.position.y)[0];
  }

  /** El robot devuelve una caja a la pila, tirándola suavemente hacia la izquierda. */
  devolver(xRobot: number) {
    this.nueva(xRobot - 22 * this.escala(), this.alto() - 40 * this.escala(), { vx: -1.5, vy: -1 });
  }

  /** La deja: un saltito desde las manos hasta arriba de la columna más baja, y ahí vuelve a tener física. */
  dejarEnColumna(base: boolean, xRobot: number) {
    const col = columnaMasBaja(this.medidas(), this.alto());
    const techo = techoColumna(col, this.medidas(), this.alto());
    const desde = { x: xRobot - 26 * this.escala() - 13, y: this.alto() - 40 * this.escala() - 10 };
    const hasta = { x: col - 13, y: techo - CAJA_ALTO - 2 };
    void volarCaja(
      this.op.carril,
      [
        { transform: `translate(${desde.x}px, ${desde.y}px) rotate(-12deg)` },
        { transform: `translate(${(desde.x + hasta.x) / 2}px, ${Math.min(desde.y, hasta.y) - 18}px) rotate(-6deg)`, offset: 0.5 },
        { transform: `translate(${hasta.x}px, ${hasta.y}px) rotate(0deg)` },
      ],
      this.op.quieto() ? 1 : 340,
    ).then(() => {
      if (this.vivo) this.nueva(col, techo - CAJA_ALTO / 2 - 0.5, { base, giro: 0 });
    });
  }

  // ---- Orden ----
  /** ¿Está esta caja quieta y mal puesta? (Las que el robot ya intentó acomodar sin éxito no cuentan mientras no las muevan.) */
  desordenadas(): Caja[] {
    const medidas = this.medidas();
    return this.cajas.filter((c, i) => estaFueraDeLugar(medidas[i], medidas, this.alto(), this.estaAgarrada(c)) && !this.rendida(c));
  }

  /** Las difíciles: fuera de lugar y que el robot ya se rindió con ellas. */
  dificiles(): Caja[] {
    const medidas = this.medidas();
    return this.cajas.filter((c, i) => estaFueraDeLugar(medidas[i], medidas, this.alto(), this.estaAgarrada(c)) && this.rendida(c));
  }

  /** El robot se rindió con esta caja: se recuerda dónde, y no se reintenta mientras no la muevan. */
  rendirse(caja: Caja) {
    this.rendidas.set(caja.cuerpo, { x: caja.cuerpo.position.x, y: caja.cuerpo.position.y });
  }

  private rendida(caja: Caja): boolean {
    const r = this.rendidas.get(caja.cuerpo);
    if (!r) return false;
    if (Math.hypot(caja.cuerpo.position.x - r.x, caja.cuerpo.position.y - r.y) <= 10) return true;
    this.rendidas.delete(caja.cuerpo); // la movieron: vuelve a contar
    return false;
  }

  // ---- Cada cuadro ----
  /** Avanza la física `ms` milisegundos con el robot parado en `xRobot`, y acomoda los SVG donde quedaron los cuerpos. */
  actualizar(ms: number, xRobot: number) {
    Body.setPosition(this.cuerpoRobot, { x: xRobot, y: this.alto() - 35 * this.escala() });
    this.moverCursor(ms);
    Engine.update(this.motor, ms);
    for (const c of this.cajas) {
      const p = c.cuerpo.position;
      if (p.y > this.alto() + 60) {
        Body.setPosition(c.cuerpo, { x: 40, y: -20 });
        Body.setVelocity(c.cuerpo, { x: 0, y: 0 });
      }
      c.el.style.transform = `translate(${p.x - CAJA_ANCHO / 2}px, ${p.y - CAJA_ALTO / 2}px) rotate(${c.cuerpo.angle}rad)`;
    }
  }

  /** Quita todo: eventos, temporizadores, cuerpos y los SVG de las cajas. */
  destruir() {
    this.vivo = false;
    for (const t of this.temporizadores) clearTimeout(t);
    this.temporizadores.clear();
    for (const limpiar of this.limpiezas) limpiar();
    const { encabezado } = this.op;
    const m = this.mouse;
    encabezado.removeEventListener("mousemove", m.mousemove);
    encabezado.removeEventListener("mousedown", m.mousedown);
    encabezado.removeEventListener("mouseup", m.mouseup);
    Events.off(this.motor, "collisionStart");
    Events.off(this.agarre, "startdrag");
    Events.off(this.agarre, "enddrag");
    Composite.clear(this.motor.world, false);
    Engine.clear(this.motor);
    for (const c of this.cajas) c.el.remove();
    this.cajas.length = 0;
    this.op.carril.querySelectorAll(".caja-voladora").forEach((el) => el.remove());
  }
}
