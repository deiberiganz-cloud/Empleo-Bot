// Seguimiento automático: lee en Gmail las novedades de las postulaciones y actualiza la base.
// - LinkedIn "se ha enviado tu solicitud a X": la oferta pasa a "postulada" (si no estaba, se crea).
// - Correo de una empresa a la que te postulaste: Claude lo clasifica (entrevista, rechazo, oferta u otro),
//   la tarjeta se mueve y queda una nota 🤖 con el resumen.
// Gmail se abre en solo lectura y cada correo se procesa una sola vez.
// Uso: node busqueda/leer-respuestas.js [días]   (por defecto, 7)
const { hayCredenciales, conGmail, leerTexto } = require('./gmail');
const { extraerOfertas } = require('./leer-alertas');

const CONFIRMACION = /se ha enviado tu solicitud a|your application was sent to/i;
const SOBRE_POSTULACION = /solicitud|candidatura|postulaci[oó]n|application/i;
// Palabras demasiado comunes para reconocer a una empresa por ellas.
const GENERICAS = new Set(['the', 'grupo', 'group', 'tech', 'digital', 'global', 'solutions', 'systems', 'consulting',
  'software', 'vacantes', 'trabajo', 'empleo', 'talent', 'hired', 'jobs', 'team', 'linkedin']);
const AVANCE = { postulada: 1, entrevista: 2, oferta: 3 };
const ESTADO_POR_TIPO = { entrevista: 'entrevista', oferta: 'oferta', rechazo: 'rechazada' };
const SIN_POSTULAR = ['nueva', 'me_interesa', 'descartada'];
// Si Claude falla 3 veces con el mismo correo, se deja de intentar: así un correo "raro" no gasta tokens
// cada 30 minutos durante una semana.
const INTENTOS_MAXIMOS = 3;

const normalizar = t => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const ddmm = fecha => fecha.toISOString().slice(5, 10).split('-').reverse().join('/');

/** La palabra con la que se reconoce a la empresa en un remitente o asunto ("Svitla Systems, Inc." → "svitla"). */
function claveEmpresa(empresa) {
  return normalizar(empresa).split(/[^a-z0-9]+/).find(p => p.length >= 4 && !GENERICAS.has(p)) || null;
}

function esDeLinkedin(correo) {
  return /@([a-z0-9-]+\.)*linkedin\.com/i.test(correo.de);
}

/**
 * Elige la oferta en proceso de la que habla el correo, mirando solo el remitente y el asunto.
 * Los correos de LinkedIn cuentan solo si hablan de una solicitud (no las alertas ni los mensajes).
 */
function ofertaDelCorreo(correo, enProceso) {
  if (esDeLinkedin(correo) && !SOBRE_POSTULACION.test(correo.asunto)) return null;
  const pajar = normalizar(`${correo.de} ${correo.asunto}`);
  return enProceso.find(o => {
    const clave = claveEmpresa(o.empresa);
    return clave && new RegExp(`\\b${clave}\\b`).test(pajar);
  }) || null;
}

/** Correos que vale la pena bajar completos: confirmaciones de LinkedIn y los que nombran a una empresa en proceso. */
function elegirCandidatos(correos, manager) {
  const enProceso = manager.enProceso();
  return correos.filter(c => !manager.yaProcesado(c.messageId)
    && ((esDeLinkedin(c) && CONFIRMACION.test(c.asunto)) || ofertaDelCorreo(c, enProceso)));
}

function registrarPostulacion(correo, manager) {
  const [aviso] = extraerOfertas(correo.texto, correo.fecha.toISOString().slice(0, 10));
  if (!aviso) return null;
  if (!manager.obtenerPorUrl(aviso.url)) {
    // Te postulaste a algo que el bot no había encontrado: lo sumamos para seguirlo igual.
    manager.guardar({ ...aviso, fuente: 'LinkedIn', descripcion: 'Postulación hecha directo en LinkedIn.',
      encontrada: aviso.fecha, motivo: 'Te postulaste directo en LinkedIn.', postular: true });
  }
  const oferta = manager.obtenerPorUrl(aviso.url);
  if (SIN_POSTULAR.includes(oferta.estado)) manager.cambiarEstado(oferta.id, 'postulada', correo.fecha.toISOString());
  manager.agregarNota(oferta.id, `🤖 ${ddmm(correo.fecha)}: LinkedIn confirmó que se envió tu solicitud.`);
  return { titulo: oferta.titulo, empresa: oferta.empresa, accion: 'postulada' };
}

async function registrarRespuesta(correo, oferta, manager, clasificar) {
  const { tipo, resumen } = await clasificar(oferta, correo);
  if (tipo === 'no_relacionado') return null;
  const destino = ESTADO_POR_TIPO[tipo];
  // Solo se avanza (de postulada a entrevista, de entrevista a oferta) o se cierra con un rechazo.
  const mueve = destino && (destino === 'rechazada' || (AVANCE[destino] ?? 0) > (AVANCE[oferta.estado] ?? 0));
  if (mueve) manager.cambiarEstado(oferta.id, destino, correo.fecha.toISOString());
  manager.agregarNota(oferta.id, `🤖 ${ddmm(correo.fecha)}: ${resumen}`);
  return { titulo: oferta.titulo, empresa: oferta.empresa, accion: mueve ? destino : 'nota' };
}

/**
 * Procesa los correos ya bajados (con texto), del más viejo al más nuevo.
 * `clasificar(oferta, correo)` devuelve { tipo, resumen }: en los tests es un Claude de mentira.
 */
async function procesar(correos, manager, clasificar) {
  const acciones = [];
  const errores = [];
  for (const correo of [...correos].sort((a, b) => a.fecha - b.fecha)) {
    if (manager.yaProcesado(correo.messageId)) continue;
    try {
      let accion = null;
      if (esDeLinkedin(correo) && CONFIRMACION.test(correo.asunto)) {
        accion = registrarPostulacion(correo, manager);
      } else {
        const oferta = ofertaDelCorreo(correo, manager.enProceso());
        if (oferta) accion = await registrarRespuesta(correo, oferta, manager, clasificar);
      }
      if (accion) acciones.push(accion);
      manager.marcarProcesado(correo.messageId);
    } catch (e) {
      // Si Claude falla, el correo no se marca: se reintenta en la próxima corrida, hasta INTENTOS_MAXIMOS veces.
      const intentos = manager.sumarIntentoFallido(correo.messageId);
      if (intentos >= INTENTOS_MAXIMOS) {
        manager.marcarProcesado(correo.messageId);
        errores.push(`${correo.asunto}: ${e.message} (falló ${intentos} veces: no se vuelve a intentar)`);
      } else {
        errores.push(`${correo.asunto}: ${e.message} (intento ${intentos} de ${INTENTOS_MAXIMOS})`);
      }
    }
  }
  return { acciones, errores };
}

const SISTEMA =
  'Clasificás correos sobre postulaciones laborales. Respondé SOLO con un objeto JSON válido, sin texto antes ni después.';

function crearClasificador(preguntarAClaude) {
  return async (oferta, correo) => {
    const prompt = `## Postulación
Puesto: ${oferta.titulo}
Empresa: ${oferta.empresa}
Estado actual: ${oferta.estado}

## Correo recibido
De: ${correo.de}
Asunto: ${correo.asunto}
${String(correo.texto).slice(0, 3000)}

Devolvé {"tipo": ..., "resumen": ...} donde:
- "tipo": "entrevista" (proponen o coordinan una entrevista o prueba), "rechazo" (no siguen con la postulación),
  "oferta" (ofrecen el puesto), "otro" (tiene que ver con esta postulación pero no es nada de lo anterior, por
  ejemplo un acuse de recibo o "vieron tu solicitud") o "no_relacionado" (no habla de esta postulación).
- "resumen": una frase corta en español con lo importante (fechas, qué piden, próximo paso), en forma impersonal
  (por ejemplo "Confirman la inscripción", no "quedaste inscrito/a").`;
    const respuesta = await preguntarAClaude(prompt, { sistema: SISTEMA, timeoutMs: 120000 });
    const json = respuesta.slice(respuesta.indexOf('{'), respuesta.lastIndexOf('}') + 1);
    const { tipo, resumen } = JSON.parse(json);
    if (!['entrevista', 'rechazo', 'oferta', 'otro', 'no_relacionado'].includes(tipo)) throw new Error(`Tipo inesperado: ${tipo}`);
    return { tipo, resumen: String(resumen || '').trim() };
  };
}

/** Lista los correos de los últimos días (solo encabezados) y baja completos únicamente los candidatos. */
async function leerCorreos(dias, manager) {
  return conGmail(async cliente => {
    const uids = await cliente.search({ gmailRaw: `newer_than:${dias}d -in:sent -in:drafts` }, { uid: true });
    const encabezados = [];
    for await (const m of cliente.fetch(uids, { envelope: true }, { uid: true })) {
      const remitente = m.envelope.from?.[0] || {};
      encabezados.push({ uid: m.uid, messageId: m.envelope.messageId || `uid-${m.uid}`,
        de: `${remitente.name || ''} <${remitente.address || ''}>`, asunto: m.envelope.subject || '' });
    }
    const correos = [];
    for (const c of elegirCandidatos(encabezados, manager)) correos.push({ ...c, ...(await leerTexto(cliente, c.uid)) });
    return correos;
  });
}

async function main() {
  if (!hayCredenciales()) {
    console.error('Falta GMAIL_USUARIO o GMAIL_CLAVE_APP en .env: se saltea el seguimiento por Gmail.');
    console.log(JSON.stringify({ acciones: [], errores: [] }));
    return;
  }
  process.removeAllListeners('warning');
  const { conectarDB } = await import('../server/config/db.js');
  const { OfertasManager } = await import('../server/dao/OfertasManager.js');
  const { preguntarAClaude } = await import('../server/services/claude.js');
  const manager = new OfertasManager(conectarDB());
  const dias = Number(process.argv[2]) || 7;
  const correos = await leerCorreos(dias, manager);
  console.log(JSON.stringify(await procesar(correos, manager, crearClasificador(preguntarAClaude))));
}

if (require.main === module) {
  main().catch(e => { console.error('No se pudo hacer el seguimiento por Gmail:', e.message); process.exit(1); });
}

module.exports = { INTENTOS_MAXIMOS, procesar, elegirCandidatos, claveEmpresa };
