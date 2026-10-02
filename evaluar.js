// Evalúa con Claude (vía la suscripción, `claude -p`) las ofertas nuevas que deja buscar.js
// (o el flujo de n8n) en data/entrada.json, las guarda en la base (data/empleo.db) y regenera reporte.html.
// Solo: `node evaluar.js` imprime el resumen en JSON. buscar.js lo usa como función (evaluar()).
const fs = require('fs');
const path = require('path');

// node:sqlite todavía es "experimental" en Node 24 y avisa por consola: lo silenciamos.
process.removeAllListeners('warning');

const DIR = __dirname;
const DATA = path.join(DIR, 'data');
const ENTRADA = path.join(DATA, 'entrada.json');
const REPORTE = path.join(DIR, 'reporte.html');
const LOTE = 20;
// Una oferta es "buena" si Claude dice que conviene postular o si tiene puntaje alto.
const PUNTAJE_MINIMO = 60;
const esBuena = o => !o.estafa && (o.postular || o.puntaje >= PUNTAJE_MINIMO);

const SISTEMA =
  'Sos un asesor de empleo. Evaluás ofertas de trabajo contra el perfil de un candidato. ' +
  'Respondé SOLO con un array JSON válido, sin texto antes ni después y sin bloques de código.';

function leerJson(archivo, porDefecto) {
  try { return JSON.parse(fs.readFileSync(archivo, 'utf8')); } catch { return porDefecto; }
}

function extraerArray(texto) {
  const inicio = texto.indexOf('[');
  const fin = texto.lastIndexOf(']');
  if (inicio === -1 || fin === -1) throw new Error('Claude no devolvió un array JSON');
  return JSON.parse(texto.slice(inicio, fin + 1));
}

async function evaluarLote(preguntarAClaude, perfil, lote) {
  const ofertas = lote.map((o, i) => ({
    id: i,
    titulo: o.titulo,
    empresa: o.empresa,
    ubicacion: o.ubicacion,
    fuente: o.fuente,
    descripcion: (o.descripcion || '').slice(0, 1200),
  }));
  const prompt = `${perfil}

## Ofertas a evaluar
${JSON.stringify(ofertas)}

Para CADA oferta devolvé un objeto con:
- "id": el mismo id
- "puntaje": 0 a 100, qué tan buena es para este candidato (0 si no cumple algo de "Cuándo NO sirve")
- "tipo": "dev" | "automatizacion" | "ecommerce" | "soporte" | "otro"
- "motivo": una frase en español explicando el puntaje
- "postular": true si vale la pena que se postule (según "Cómo puntuar": ante la duda, true), si no false
- "estafa": true si tiene señales de estafa, si no false`;

  // Misma forma de llamar a Claude que usa la API para las cartas (server/services/claude.js).
  const respuesta = await preguntarAClaude(prompt, { sistema: SISTEMA, timeoutMs: 300000 });
  return extraerArray(respuesta);
}

function escapar(t) {
  return String(t ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

function generarReporte(todas) {
  const filas = todas
    .filter(esBuena)
    .sort((a, b) => (b.encontrada || '').localeCompare(a.encontrada || '') || b.puntaje - a.puntaje)
    .map(o => `<tr><td class="p">${o.puntaje}</td><td><a href="${escapar(o.url)}" target="_blank">${escapar(o.titulo)}</a><br><small>${escapar(o.empresa)} · ${escapar(o.fuente)} · ${escapar(o.ubicacion)}</small></td><td>${escapar(o.tipo)}</td><td>${escapar(o.motivo)}</td><td>${escapar(o.encontrada)}</td><td>${escapar(o.estado)}</td></tr>`)
    .join('\n');
  const html = `<!doctype html><html lang="es"><meta charset="utf-8"><title>Ofertas de empleo</title>
<style>body{font-family:Arial,sans-serif;margin:16px;color:#1a1a2e}table{border-collapse:collapse;width:100%}td,th{border-bottom:1px solid #ddd;padding:6px;text-align:left;vertical-align:top;font-size:13px}th{background:#0f3460;color:#fff}.p{font-weight:bold;font-size:16px}small{color:#666}</style>
<h1>Ofertas para postular</h1><p>Actualizado: ${new Date().toLocaleString('es-AR')} · ${todas.length} ofertas evaluadas en total</p>
<table><tr><th>Puntaje</th><th>Oferta</th><th>Tipo</th><th>Por qué</th><th>Encontrada</th><th>Estado</th></tr>
${filas}</table></html>`;
  fs.writeFileSync(REPORTE, html, 'utf8');
}

/**
 * Evalúa las ofertas nuevas de data/entrada.json, las guarda y anota la búsqueda en la base.
 * @param {{ erroresFuentes?: string[] }} opciones portales que no respondieron (para el resumen)
 * @returns el resumen: recibidas, evaluadas, buenas (de esta vez), buenasHoy, top, limpieza y errores
 */
async function evaluar({ erroresFuentes = [] } = {}) {
  // La base y su manager son los mismos que usa la API (server/), así hay una sola forma de guardar.
  const { conectarDB } = await import('./server/config/db.js');
  const { OfertasManager } = await import('./server/dao/OfertasManager.js');
  const { preguntarAClaude } = await import('./server/services/claude.js');
  const manager = new OfertasManager(conectarDB());

  const perfil = fs.readFileSync(path.join(DIR, 'perfil.md'), 'utf8');
  const entrada = leerJson(ENTRADA, []);
  const vistas = manager.urlsGuardadas();
  const nuevas = entrada.filter(o => o.url && !vistas.has(o.url));
  const hoy = new Date().toISOString().slice(0, 10);
  // Los errores de los portales que no respondieron (los manda buscar.js) van al mismo resumen.
  const errores = [...erroresFuentes];
  let guardadas = 0;
  let buenasDeEstaVez = 0;

  for (let i = 0; i < nuevas.length; i += LOTE) {
    const lote = nuevas.slice(i, i + LOTE);
    try {
      const notas = await evaluarLote(preguntarAClaude, perfil, lote);
      for (const n of notas) {
        const o = lote[n.id];
        if (!o) continue;
        const oferta = { ...o, puntaje: n.puntaje, tipo: n.tipo, motivo: n.motivo,
          postular: !!n.postular, estafa: !!n.estafa, encontrada: hoy };
        if (!manager.guardar(oferta)) continue;
        guardadas++;
        if (esBuena(oferta)) buenasDeEstaVez++;
      }
    } catch (e) {
      // El lote que falla no se guarda: la próxima búsqueda lo vuelve a evaluar.
      errores.push(`Claude: ${e.message}`);
    }
  }

  // Mantenimiento diario: archiva lo cerrado y borra lo viejo (ver OfertasManager.limpiar).
  const limpieza = manager.limpiar();

  const todas = manager.listar();
  generarReporte(todas);
  const buenas = todas.filter(o => o.encontrada === hoy && esBuena(o))
    .sort((a, b) => b.puntaje - a.puntaje);
  // Queda anotada en la base: la app muestra la última y decide cuándo toca la próxima.
  manager.registrarBusqueda({ recibidas: entrada.length, nuevas: guardadas, buenas: buenasDeEstaVez, errores });
  return { recibidas: entrada.length, evaluadas: guardadas, buenas: buenasDeEstaVez, buenasHoy: buenas.length,
    top: buenas.slice(0, 10).map(o => ({ puntaje: o.puntaje, titulo: o.titulo, empresa: o.empresa, url: o.url })),
    reporte: REPORTE, limpieza, errores };
}

if (require.main === module) {
  evaluar().then(resumen => console.log(JSON.stringify(resumen))).catch(e => {
    console.error(e);
    process.exit(1);
  });
}

module.exports = { evaluar };
