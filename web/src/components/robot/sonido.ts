// El sonido del robot: una melodía de flauta y efectos, todo sintetizado con Web Audio (sin archivos de audio).
// Mientras el sonido está apagado no se crea ningún nodo: el AudioContext nace recién la primera vez que algo suena.
import { MS_INCLINADA, MS_TEMBLOR } from "../../domain/robot";

// La menor, 4/4, 84 pulsos por minuto. Casi pentatónica (la, do, re, mi, sol): ese es el "aire oriental".
// Cada nota: [midi, pulsos]; null = silencio.
const MELODIA: [number | null, number][] = [
  [76, 1.5], [74, 0.5], [72, 1], [69, 1], [67, 0.5], [69, 0.5], [72, 1], [74, 2],
  [76, 1], [79, 1], [76, 0.5], [74, 0.5], [72, 1], [74, 1.5], [72, 0.5], [69, 2],
  [69, 0.5], [72, 0.5], [74, 1], [76, 1], [79, 0.5], [81, 0.5], [79, 1.5], [76, 0.5], [74, 2],
  [72, 1], [74, 0.5], [76, 0.5], [74, 1], [72, 1], [69, 3], [null, 3],
];
const PULSO = 60 / 84;
// El enojo: [tono de, tono a, duración, cuándo] en Hz y segundos; dura 1,3 s como la animación (16 cuadros a 12 fps)
const ENOJO_PITIDOS: [number, number, number, number][] = [
  [420, 640, 0.09, 0],
  [600, 330, 0.1, 0.13],
  [380, 560, 0.09, 0.28],
  [520, 260, 0.12, 0.42],
  [300, 150, 0.45, 0.6],
];
const ENOJO_PISOTONES = [0.3, 0.7]; // segundos en que cae cada pisotón
const ENOJO_VAPOR = 0.75;
const ENOJO_SEGUNDOS = 1.3;
/** Casi inaudible: es música de fondo. */
export const VOLUMEN = 0.001;
/** Volumen propio de los efectos, aparte del de la flauta. */
export const VOLUMEN_EFECTOS = 0.05;

/** Un canal = un efecto con su propio volumen; cuando suena su última fuente se desconecta todo solo. */
export interface Canal {
  out: GainNode;
  cerrado: boolean;
  /** Registra una fuente ya arrancada; al terminar se suelta con sus filtros. */
  poner: (fuente: AudioScheduledSourceNode, ...nodos: AudioNode[]) => void;
  /** Fundido de `seg` segundos y fin. */
  cerrar: (seg: number) => void;
}

interface EstadoCorto {
  generacion: number;
  zumbido?: Canal | null;
  fuego?: Canal | null;
  encendio?: boolean;
  crujio?: boolean;
  cayo?: boolean;
}

interface EstadoBerrinche {
  generacion: number;
  desde: number;
  clank?: boolean;
  zumbido?: Canal | null;
}

type TipoFiltro = BiquadFilterType;

const aleatorio = (a: number, b: number) => a + Math.random() * (b - a);
const curvaDistorsion = () => Float32Array.from({ length: 256 }, (_, i) => Math.tanh(((i / 255) * 2 - 1) * 4));
/** Lo que dura la tensión del berrinche: el tono del zumbido sube todo ese tiempo. */
const SEGUNDOS_ZUMBIDO = 1 + (MS_INCLINADA + MS_TEMBLOR) / 1000 + 0.8;
const nivelSacudon = (i: number) => (i <= 13 ? 1 : Math.max(0, 1 - (i - 13) / 11)); // el sacudón se apaga entre el 14 y el 24
const nivelFuego = (i: number) => (i < 6 ? 0 : i < 12 ? (i - 5) / 7 : i <= 21 ? 1 : Math.max(0, 1 - (i - 21) / 5)); // crece 6-12, se apaga 21-26

export class Sonido {
  private prendido = false;
  private audio: AudioContext | null = null;
  private eco: ConvolverNode | null = null;
  private salida: GainNode | null = null;
  private relojMusica: ReturnType<typeof setTimeout> | null = null;
  private quiereMusica = false;
  private busEfectos: GainNode | null = null;
  private busAEco: GainNode | null = null;
  private bufferRuido: AudioBuffer | null = null;
  private generacion = 0;
  private readonly canales = new Set<Canal>();
  private corto: EstadoCorto | null = null;
  private berrinche: EstadoBerrinche | null = null;
  private enojoHasta = 0; // hasta cuándo suena el refunfuño (ms); evita encimar otro
  private readonly temporizadores = new Set<ReturnType<typeof setTimeout>>();

  /** Prende o apaga todo. Apagar corta la flauta y los efectos que estén sonando. */
  fijar(prendido: boolean) {
    if (this.prendido === prendido) return;
    this.prendido = prendido;
    if (prendido) {
      if (this.quiereMusica) this.empezarMusica();
    } else {
      this.pararMusica();
      this.pararEfectos();
    }
  }

  /** La flauta pide sonar (o parar). Suena solo si el sonido está prendido; si lo prenden después, arranca ahí. */
  pedirMusica(si: boolean) {
    this.quiereMusica = si;
    if (si && this.prendido) this.empezarMusica();
    else if (!si) this.pararMusica();
  }

  /** Corta todo y suelta los recursos (al desmontar el robot). */
  destruir() {
    this.quiereMusica = false;
    this.pararMusica();
    this.pararEfectos();
    for (const t of this.temporizadores) clearTimeout(t);
    this.temporizadores.clear();
    void this.audio?.close().catch(() => undefined);
    this.audio = null;
    this.eco = null;
    this.prendido = false;
  }

  // ---- Base ----
  private despues(ms: number, accion: () => void) {
    const t = setTimeout(() => {
      this.temporizadores.delete(t);
      accion();
    }, ms);
    this.temporizadores.add(t);
  }

  /** El AudioContext y el eco de sala: nacen la primera vez que suena algo. */
  private preparar(): { audio: AudioContext; eco: ConvolverNode } | null {
    if (!this.audio) {
      const Contexto = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Contexto) return null;
      this.audio = new Contexto();
      // eco de sala: una "respuesta" de ruido que se apaga en 1,6 s
      const eco = this.audio.createConvolver();
      const largo = this.audio.sampleRate * 1.6;
      const buf = this.audio.createBuffer(2, largo, this.audio.sampleRate);
      for (let c = 0; c < 2; c++) {
        const d = buf.getChannelData(c);
        for (let i = 0; i < largo; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / largo, 3);
      }
      eco.buffer = buf;
      const mojado = this.audio.createGain();
      mojado.gain.value = 0.28;
      eco.connect(mojado).connect(this.audio.destination);
      this.eco = eco;
    }
    void this.audio.resume().catch(() => undefined);
    return this.eco ? { audio: this.audio, eco: this.eco } : null;
  }

  // ---- La flauta ----
  private nota(audio: AudioContext, midi: number, cuando: number, dura: number, bus: AudioNode) {
    const f = 440 * Math.pow(2, (midi - 69) / 12);
    const env = audio.createGain();
    env.gain.value = 0;
    env.connect(bus);
    const o1 = audio.createOscillator();
    o1.type = "sine";
    o1.frequency.value = f;
    const o2 = audio.createOscillator();
    o2.type = "triangle";
    o2.frequency.value = f * 2;
    const g2 = audio.createGain();
    g2.gain.value = 0.07;
    // vibrato que aparece a mitad de la nota, como un flautista
    const lfo = audio.createOscillator();
    lfo.frequency.value = 5.2;
    const prof = audio.createGain();
    prof.gain.setValueAtTime(0, cuando);
    prof.gain.linearRampToValueAtTime(f * 0.006, cuando + Math.min(0.35, dura * 0.6));
    lfo.connect(prof);
    prof.connect(o1.frequency);
    prof.connect(o2.frequency);
    o1.connect(env);
    o2.connect(g2).connect(env);
    // soplido: ruido filtrado, fuerte al ataque y casi nada después
    const ruido = audio.createBufferSource();
    const nb = audio.createBuffer(1, Math.max(1, Math.floor(audio.sampleRate * dura)), audio.sampleRate);
    const nd = nb.getChannelData(0);
    for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
    ruido.buffer = nb;
    const filtro = audio.createBiquadFilter();
    filtro.type = "bandpass";
    filtro.frequency.value = f * 2.2;
    filtro.Q.value = 1.2;
    const gr = audio.createGain();
    gr.gain.setValueAtTime(0.18, cuando);
    gr.gain.exponentialRampToValueAtTime(0.02, cuando + 0.12);
    ruido.connect(filtro).connect(gr).connect(env);
    env.gain.setValueAtTime(0, cuando);
    env.gain.linearRampToValueAtTime(0.9, cuando + 0.06);
    env.gain.linearRampToValueAtTime(0.75, cuando + 0.2);
    env.gain.setValueAtTime(0.75, cuando + Math.max(0.2, dura - 0.12));
    env.gain.linearRampToValueAtTime(0, cuando + dura);
    for (const n of [o1, o2, lfo, ruido]) {
      n.start(cuando);
      n.stop(cuando + dura + 0.05);
    }
  }

  private empezarMusica() {
    const base = this.preparar();
    if (!base) return;
    const { audio, eco } = base;
    this.pararMusica();
    const salida = audio.createGain();
    salida.gain.value = VOLUMEN;
    salida.connect(audio.destination);
    salida.connect(eco);
    this.salida = salida;
    const vuelta = () => {
      let t = audio.currentTime + 0.1;
      for (const [midi, pulsos] of MELODIA) {
        const dura = pulsos * PULSO;
        if (midi !== null) this.nota(audio, midi, t, dura - 0.03, salida);
        t += dura;
      }
      this.relojMusica = setTimeout(vuelta, (t - audio.currentTime - 0.15) * 1000);
    };
    vuelta();
  }

  private pararMusica() {
    if (this.relojMusica) clearTimeout(this.relojMusica);
    this.relojMusica = null;
    const s = this.salida;
    this.salida = null;
    if (s && this.audio) {
      s.gain.setTargetAtTime(0, this.audio.currentTime, 0.08);
      this.despues(400, () => s.disconnect());
    }
  }

  // ---- Los efectos ----
  /** El bus de los efectos: solo existe con el sonido prendido (apagado no se crea ningún nodo). */
  private conEfectos(): { audio: AudioContext; bus: GainNode; eco: ConvolverNode } | null {
    if (!this.prendido) return null;
    const base = this.preparar();
    if (!base) return null;
    if (!this.busEfectos || !this.busAEco) {
      const bus = base.audio.createGain();
      bus.gain.value = VOLUMEN_EFECTOS;
      const aEco = base.audio.createGain();
      aEco.gain.value = 0.1; // un poquito de eco, poco
      bus.connect(base.audio.destination);
      bus.connect(aEco).connect(base.eco);
      this.busEfectos = bus;
      this.busAEco = aEco;
    }
    return { audio: base.audio, bus: this.busEfectos, eco: base.eco };
  }

  private ruidoBlanco(audio: AudioContext): AudioBuffer {
    if (!this.bufferRuido) {
      this.bufferRuido = audio.createBuffer(1, audio.sampleRate * 2, audio.sampleRate);
      const d = this.bufferRuido.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    return this.bufferRuido;
  }

  private canal(nivel = 0): { c: Canal; audio: AudioContext } | null {
    const base = this.conEfectos();
    if (!base) return null;
    const { audio, bus } = base;
    const out = audio.createGain();
    out.gain.value = nivel;
    out.connect(bus);
    const fuentes: AudioScheduledSourceNode[] = [];
    const canales = this.canales;
    const c: Canal = {
      out,
      cerrado: false,
      poner(src, ...nodos) {
        fuentes.push(src);
        src.addEventListener("ended", () => {
          src.disconnect();
          for (const n of nodos) n.disconnect();
          fuentes.splice(fuentes.indexOf(src), 1);
          if (!fuentes.length) {
            out.disconnect();
            canales.delete(c);
          }
        });
      },
      cerrar(seg) {
        if (c.cerrado) return;
        c.cerrado = true;
        const t = audio.currentTime;
        out.gain.cancelScheduledValues(t);
        out.gain.setValueAtTime(out.gain.value, t);
        out.gain.linearRampToValueAtTime(0, t + seg);
        for (const s of fuentes) {
          try {
            s.stop(t + seg + 0.05);
          } catch {
            /* ya paró */
          }
        }
      },
    };
    canales.add(c);
    return { c, audio };
  }

  /** Apagar el sonido a mitad de un efecto: fundido corto y se sueltan todos los nodos. */
  private pararEfectos() {
    this.generacion++;
    this.corto = null;
    this.berrinche = null;
    this.enojoHasta = 0;
    const bus = this.busEfectos;
    const aEco = this.busAEco;
    if (!bus || !aEco || !this.audio) return;
    const viejos = [...this.canales];
    const t = this.audio.currentTime;
    this.busEfectos = null;
    this.busAEco = null;
    this.canales.clear();
    bus.gain.setTargetAtTime(0, t, 0.02);
    this.despues(400, () => {
      bus.disconnect();
      aEco.disconnect();
      for (const c of viejos) c.out.disconnect();
    });
    // cada canal se cierra con un fundido corto (también las fuentes en bucle: zumbido, fuego, brasas)
    for (const c of viejos) c.cerrar(0.1);
  }

  /** Ráfaga corta de ruido filtrado: chasquido, pop de leña o golpe sordo, según el filtro. */
  private estallido(audio: AudioContext, c: Canal, cuando: number, freq: number, dura: number, vol: number, tipo: TipoFiltro = "bandpass", q = 1.5) {
    const s = audio.createBufferSource();
    s.buffer = this.ruidoBlanco(audio);
    const f = audio.createBiquadFilter();
    f.type = tipo;
    f.frequency.value = freq;
    f.Q.value = q;
    const e = audio.createGain();
    e.gain.setValueAtTime(0, cuando);
    e.gain.linearRampToValueAtTime(vol, cuando + 0.003);
    e.gain.exponentialRampToValueAtTime(0.001, cuando + dura);
    s.connect(f).connect(e).connect(c.out);
    s.start(cuando, Math.random() * 1.5, dura + 0.02);
    c.poner(s, f, e);
  }

  /** Seno que cae de tono (el cuerpo de un golpe sordo). */
  private bajon(audio: AudioContext, c: Canal, cuando: number, de: number, a: number, dura: number, vol: number) {
    const o = audio.createOscillator();
    o.type = "sine";
    o.frequency.setValueAtTime(de, cuando);
    o.frequency.exponentialRampToValueAtTime(a, cuando + dura);
    const e = audio.createGain();
    e.gain.setValueAtTime(0, cuando);
    e.gain.linearRampToValueAtTime(vol, cuando + 0.01);
    e.gain.exponentialRampToValueAtTime(0.001, cuando + dura + 0.1);
    o.connect(e).connect(c.out);
    o.start(cuando);
    o.stop(cuando + dura + 0.15);
    c.poner(o, e);
  }

  /** Ruido en bucle (para zumbidos continuos): lo para el canal al cerrarse. */
  private ruidoContinuo(audio: AudioContext, c: Canal, filtro: BiquadFilterNode) {
    const s = audio.createBufferSource();
    s.buffer = this.ruidoBlanco(audio);
    s.loop = true;
    s.connect(filtro);
    s.start(0, Math.random());
    c.poner(s, filtro);
  }

  // Electrocutado: sierra grave distorsionada que tiembla (dos moduladores que no se alinean) + chasquidos
  private zumbido(): Canal | null {
    const base = this.canal();
    if (!base) return null;
    const { c, audio } = base;
    const o = audio.createOscillator();
    o.type = "sawtooth";
    o.frequency.value = 110;
    const forma = audio.createWaveShaper();
    forma.curve = curvaDistorsion();
    const filtro = audio.createBiquadFilter();
    filtro.type = "lowpass";
    filtro.frequency.value = 1800;
    const trem = audio.createGain();
    trem.gain.value = 0.7;
    o.connect(forma).connect(filtro).connect(trem).connect(c.out);
    const vib = audio.createOscillator();
    vib.frequency.value = 23;
    const profVib = audio.createGain();
    profVib.gain.value = 9;
    vib.connect(profVib).connect(o.frequency);
    const lfo = audio.createOscillator();
    lfo.frequency.value = 31;
    const profLfo = audio.createGain();
    profLfo.gain.value = 0.3;
    lfo.connect(profLfo).connect(trem.gain);
    for (const n of [o, vib, lfo]) n.start();
    c.poner(o, forma, filtro, trem);
    c.poner(vib, profVib);
    c.poner(lfo, profLfo);
    return c;
  }

  private temblar(c: Canal, nivel: number) {
    if (!this.audio) return;
    const audio = this.audio;
    const t = audio.currentTime;
    c.out.gain.setTargetAtTime(nivel * aleatorio(0.3, 0.6), t, 0.015);
    const n = Math.random() < nivel * 0.9 ? (Math.random() < 0.5 ? 2 : 1) : 0;
    for (let k = 0; k < n; k++) this.estallido(audio, c, t + Math.random() * 0.08, aleatorio(3500, 9000), aleatorio(0.02, 0.05), aleatorio(0.5, 1) * 1.6, "highpass", 0.7);
  }

  // Incendio: "fuush" de encendido + crepitar (ruido grave suave y pops de leña)
  private encender() {
    const base = this.canal(1);
    if (!base) return;
    const { c, audio } = base;
    const t = audio.currentTime;
    const f = audio.createBiquadFilter();
    f.type = "bandpass";
    f.Q.value = 0.8;
    f.frequency.setValueAtTime(300, t);
    f.frequency.exponentialRampToValueAtTime(2400, t + 0.45);
    const e = audio.createGain();
    e.gain.setValueAtTime(0, t);
    e.gain.linearRampToValueAtTime(0.7, t + 0.25);
    e.gain.exponentialRampToValueAtTime(0.001, t + 0.7);
    const s = audio.createBufferSource();
    s.buffer = this.ruidoBlanco(audio);
    s.connect(f).connect(e).connect(c.out);
    s.start(t, Math.random(), 0.8);
    c.poner(s, f, e);
  }

  private fuego(): Canal | null {
    const base = this.canal();
    if (!base) return null;
    const { c, audio } = base;
    const filtro = audio.createBiquadFilter();
    filtro.type = "lowpass";
    filtro.frequency.value = 650;
    const suave = audio.createGain();
    suave.gain.value = 0.35;
    filtro.connect(suave).connect(c.out);
    this.ruidoContinuo(audio, c, filtro);
    return c;
  }

  private crepitar(c: Canal, nivel: number) {
    if (!this.audio) return;
    const audio = this.audio;
    const t = audio.currentTime;
    c.out.gain.setTargetAtTime(nivel * 0.9, t, 0.05);
    const n = Math.random() < nivel * 0.9 ? (Math.random() < 0.5 ? 2 : 1) : 0;
    for (let k = 0; k < n; k++) this.estallido(audio, c, t + Math.random() * 0.08, aleatorio(900, 3200), aleatorio(0.015, 0.05), aleatorio(0.3, 0.8), "bandpass", 3);
  }

  // Desmoronarse: crujido de cartón quemado y un golpe sordo suave al caer
  private crujir() {
    const base = this.canal(1);
    if (!base) return;
    const { c, audio } = base;
    const t = audio.currentTime;
    this.estallido(audio, c, t, 1400, 0.3, 0.3, "bandpass", 0.7);
    this.estallido(audio, c, t + 0.12, 2200, 0.05, 0.35, "bandpass", 2);
    this.estallido(audio, c, t + 0.24, 1800, 0.06, 0.3, "bandpass", 2);
  }

  private caer() {
    const base = this.canal(1);
    if (!base) return;
    const { c, audio } = base;
    const t = audio.currentTime;
    this.estallido(audio, c, t, 260, 0.3, 0.9, "lowpass", 0.7);
    this.bajon(audio, c, t, 110, 45, 0.25, 0.8);
    this.estallido(audio, c, t + 0.05, 1600, 0.35, 0.12, "highpass", 0.7); // cenizas que se asientan
  }

  /** El cortocircuito, cuadro por cuadro (0 a 35): zumbido, encendido, crepitar, crujido y caída. */
  sonarCorto(i: number) {
    if (!this.prendido) return;
    if (i === 0 || !this.corto || this.corto.generacion !== this.generacion) this.corto = { generacion: this.generacion };
    const cc = this.corto;
    const sacudon = nivelSacudon(i);
    if (sacudon > 0 && !cc.zumbido) cc.zumbido = this.zumbido();
    if (cc.zumbido && !cc.zumbido.cerrado) {
      if (sacudon > 0) this.temblar(cc.zumbido, sacudon);
      else cc.zumbido.cerrar(0.12);
    }
    if (i >= 6 && i <= 8 && !cc.encendio) {
      cc.encendio = true;
      this.encender();
    }
    const llama = nivelFuego(i);
    if (llama > 0 && !cc.fuego) cc.fuego = this.fuego();
    if (cc.fuego && !cc.fuego.cerrado) {
      if (llama > 0) this.crepitar(cc.fuego, llama);
      else cc.fuego.cerrar(0.15);
    }
    if (i >= 20 && i <= 22 && !cc.crujio) {
      cc.crujio = true;
      this.crujir();
    }
    if (i >= 24 && i <= 26 && !cc.cayo) {
      cc.cayo = true;
      this.caer();
    }
  }

  /** Al terminar la escena: por si algún cuadro se saltó, se cierra lo que haya quedado sonando. */
  cerrarCorto() {
    this.corto?.zumbido?.cerrar(0.12);
    this.corto?.fuego?.cerrar(0.15);
    this.corto = null;
  }

  /** Siseo de brasas (muy bajito) mientras queda humeando. Devuelve el canal para cerrarlo después. */
  brasas(): Canal | null {
    const base = this.canal();
    if (!base) return null;
    const { c, audio } = base;
    const t = audio.currentTime;
    const filtro = audio.createBiquadFilter();
    filtro.type = "bandpass";
    filtro.frequency.value = 4500;
    filtro.Q.value = 0.6;
    filtro.connect(c.out);
    this.ruidoContinuo(audio, c, filtro);
    c.out.gain.setValueAtTime(0, t);
    c.out.gain.linearRampToValueAtTime(0.1, t + 0.6);
    return c;
  }

  /** Algún chasquidito de las brasas (se llama en cada cuadro de la escena). */
  chisporrotear(c: Canal) {
    if (!this.audio || !this.prendido) return;
    if (Math.random() < 0.15) this.estallido(this.audio, c, this.audio.currentTime, aleatorio(1500, 3500), aleatorio(0.015, 0.04), aleatorio(0.5, 1.2), "bandpass", 3);
  }

  // "Oh-oh": dos pitidos tristes (el segundo más grave); seno con un armónico triangular suave
  private pitido(audio: AudioContext, c: Canal, cuando: number, de: number, a: number, dura: number, vol: number) {
    const e = audio.createGain();
    e.gain.setValueAtTime(0, cuando);
    e.gain.linearRampToValueAtTime(vol, cuando + 0.03);
    e.gain.setValueAtTime(vol, cuando + dura * 0.5);
    e.gain.linearRampToValueAtTime(0, cuando + dura);
    e.connect(c.out);
    const o1 = audio.createOscillator();
    o1.type = "sine";
    const o2 = audio.createOscillator();
    o2.type = "triangle";
    const g2 = audio.createGain();
    g2.gain.value = 0.2;
    for (const [o, k] of [[o1, 1], [o2, 2]] as const) {
      o.frequency.setValueAtTime(de * k, cuando);
      o.frequency.linearRampToValueAtTime(a * k, cuando + dura);
    }
    o1.connect(e);
    o2.connect(g2).connect(e);
    for (const o of [o1, o2]) {
      o.start(cuando);
      o.stop(cuando + dura + 0.05);
    }
    c.poner(o1, e);
    c.poner(o2, g2);
  }

  ohOh() {
    const base = this.canal(1);
    if (!base) return;
    const { c, audio } = base;
    const t = audio.currentTime + 0.05;
    this.pitido(audio, c, t, 620, 560, 0.2, 0.7);
    this.pitido(audio, c, t + 0.32, 470, 340, 0.36, 0.7);
  }

  // Golpe: "bonk" de caricatura (golpe sordo) + "boing" de resorte que se amortigua
  private boing(audio: AudioContext, c: Canal, cuando: number) {
    const o = audio.createOscillator();
    o.type = "triangle";
    o.frequency.setValueAtTime(380, cuando);
    for (let k = 0; k < 10; k++) o.frequency.linearRampToValueAtTime(330 + (k % 2 ? -1 : 1) * 150 * Math.pow(0.7, k), cuando + (k + 1) * 0.05);
    const e = audio.createGain();
    e.gain.setValueAtTime(0, cuando);
    e.gain.linearRampToValueAtTime(0.45, cuando + 0.01);
    e.gain.exponentialRampToValueAtTime(0.001, cuando + 0.6);
    o.connect(e).connect(c.out);
    o.start(cuando);
    o.stop(cuando + 0.65);
    c.poner(o, e);
  }

  sonarGolpe() {
    const base = this.canal(1);
    if (!base) return;
    const { c, audio } = base;
    const t = audio.currentTime + 0.01;
    this.bajon(audio, c, t, 190, 55, 0.16, 0.9);
    this.estallido(audio, c, t, 500, 0.08, 0.7, "lowpass", 0.7);
    this.boing(audio, c, t + 0.06);
  }

  // Enojo: refunfuño de robot de caricatura ("bip-bop-brrr"), un golpe grave por pisotón y un "pfff" de vapor
  private bip(audio: AudioContext, c: Canal, cuando: number, de: number, a: number, dura: number, tipo: OscillatorType) {
    const o = audio.createOscillator();
    o.type = tipo;
    o.frequency.setValueAtTime(de, cuando);
    o.frequency.exponentialRampToValueAtTime(a, cuando + dura);
    const f = audio.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.value = 2200; // quita lo más áspero de la onda cuadrada
    const e = audio.createGain();
    e.gain.setValueAtTime(0, cuando);
    e.gain.linearRampToValueAtTime(0.35, cuando + 0.012);
    e.gain.setValueAtTime(0.35, cuando + dura * 0.6);
    e.gain.linearRampToValueAtTime(0, cuando + dura);
    o.connect(f).connect(e).connect(c.out);
    o.start(cuando);
    o.stop(cuando + dura + 0.03);
    c.poner(o, f, e);
  }

  /** El robot se enoja: no arranca otro mientras el anterior sigue sonando. */
  sonarEnojo() {
    if (!this.prendido || Date.now() < this.enojoHasta) return;
    const base = this.canal(1);
    if (!base) return;
    const { c, audio } = base;
    this.enojoHasta = Date.now() + ENOJO_SEGUNDOS * 1000;
    const t = audio.currentTime + 0.03;
    // 5 pitidos que suben y bajan de tono, cada vez más graves; el último se arrastra ("brrr")
    ENOJO_PITIDOS.forEach(([de, a, dura, cuando], i) => {
      const ultimo = i === ENOJO_PITIDOS.length - 1;
      this.bip(audio, c, t + cuando, de, a, dura, ultimo ? "sawtooth" : "square");
    });
    // un golpe grave en cada pisotón
    for (const pisa of ENOJO_PISOTONES) this.bajon(audio, c, t + pisa, 120, 50, 0.12, 0.7);
    // vapor: ruido filtrado que sube de tono y se apaga
    this.estallido(audio, c, t + ENOJO_VAPOR, 3500, 0.45, 0.35, "bandpass", 0.8);
  }

  // Berrinche: "clank" metálico al agarrarse, zumbido eléctrico que sube de tono mientras hace fuerza,
  // retumbe de tierra al inclinarse y "fiuu-pop" satisfecho
  private clank() {
    const base = this.canal(1);
    if (!base) return;
    const { c, audio } = base;
    const t = audio.currentTime + 0.01;
    this.estallido(audio, c, t, 2600, 0.06, 0.8, "bandpass", 4);
    for (const [f, v] of [[820, 0.35], [1330, 0.25], [2170, 0.15]]) this.bajon(audio, c, t, f, f * 0.96, 0.18, v); // resonancias de metal
    this.bajon(audio, c, t, 160, 70, 0.1, 0.7);
  }

  private zumbidoSube(): Canal | null {
    const base = this.canal();
    if (!base) return null;
    const { c, audio } = base;
    const t = audio.currentTime;
    const o = audio.createOscillator();
    o.type = "sawtooth";
    o.frequency.setValueAtTime(70, t);
    o.frequency.exponentialRampToValueAtTime(340, t + SEGUNDOS_ZUMBIDO);
    const forma = audio.createWaveShaper();
    forma.curve = curvaDistorsion();
    const filtro = audio.createBiquadFilter();
    filtro.type = "lowpass";
    filtro.frequency.value = 1600;
    const trem = audio.createGain();
    trem.gain.value = 0.7;
    o.connect(forma).connect(filtro).connect(trem).connect(c.out);
    const lfo = audio.createOscillator();
    lfo.frequency.value = 29;
    const prof = audio.createGain();
    prof.gain.value = 0.3;
    lfo.connect(prof).connect(trem.gain);
    o.start(t);
    lfo.start(t);
    c.poner(o, forma, filtro, trem);
    c.poner(lfo, prof);
    return c;
  }

  /** El berrinche, cuadro por cuadro (0 a 35): clank al agarrarse y zumbido que sube hasta que se suelta. */
  sonarBerrinche(i: number) {
    if (!this.prendido) return;
    if (i === 0 || !this.berrinche || this.berrinche.generacion !== this.generacion) this.berrinche = { generacion: this.generacion, desde: Date.now() };
    const b = this.berrinche;
    if (i >= 13 && !b.clank) {
      b.clank = true;
      this.clank();
    }
    if (i >= 12 && !b.zumbido) b.zumbido = this.zumbidoSube();
    if (b.zumbido && !b.zumbido.cerrado) this.temblar(b.zumbido, Math.min(1, 0.4 + (Date.now() - b.desde) / 4000)); // más chasquidos cuanto más fuerza
  }

  /** Se suelta (o termina la escena): se corta el zumbido. */
  cerrarBerrinche() {
    this.berrinche?.zumbido?.cerrar(0.12);
    this.berrinche = null;
  }

  /** Temblor de tierra: grave y largo al inclinarse, corto al volver. */
  sonarRetumbe(fuerte: boolean) {
    const base = this.canal(1);
    if (!base) return;
    const { c, audio } = base;
    const t = audio.currentTime + 0.02;
    const dura = fuerte ? 1.1 : 0.5;
    this.bajon(audio, c, t, fuerte ? 62 : 80, 28, dura, fuerte ? 1 : 0.8);
    this.estallido(audio, c, t, 140, dura, 0.9, "lowpass", 0.7);
    if (fuerte) for (const d of [0.15, 0.35, 0.6]) this.estallido(audio, c, t + d, aleatorio(500, 1100), 0.06, 0.25, "bandpass", 2); // cajas que se arrastran
  }

  /** "Fiuu-pop" de satisfacción y un pitidito alegre. */
  sonarSatisfecho() {
    const base = this.canal(1);
    if (!base) return;
    const { c, audio } = base;
    const t = audio.currentTime + 0.03;
    this.pitido(audio, c, t, 500, 1500, 0.28, 0.6);
    this.estallido(audio, c, t + 0.3, 1400, 0.05, 0.9, "bandpass", 2);
    this.bajon(audio, c, t + 0.3, 700, 300, 0.06, 0.5);
    this.pitido(audio, c, t + 0.45, 900, 1100, 0.12, 0.5);
  }
}
