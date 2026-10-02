// Búsqueda completa de ofertas, sin n8n: hace lo mismo que el flujo "Empleo 1 - Búsqueda diaria".
// 1. Baja los 6 portales gratis, todos a la vez y cada uno por su lado: si uno no responde, los demás siguen.
// 2. Suma las alertas de LinkedIn que llegan a Gmail.
// 3. Normaliza y prefiltra sin IA (normalizar.js: el mismo código que el nodo de n8n).
// 4. Guarda data/entrada.json y Claude evalúa las nuevas (evaluar.js), que anota la búsqueda en la base.
// Uso: node busqueda/buscar.js   → imprime el resumen en JSON. La app lo corre sola cada 12 horas.
const fs = require('fs');
const path = require('path');
const { hayCredenciales } = require('./gmail');
const { leerAlertas } = require('./leer-alertas');

const ENTRADA = path.join(__dirname, '..', 'data', 'entrada.json');
const CABECERAS = { 'User-Agent': 'Mozilla/5.0 (empleo-bot personal)' };
// Un portal que no contesta en 30 segundos se da por caído (así la búsqueda nunca queda colgada).
const ESPERA_MAXIMA_MS = 30000;
const DIAS_DE_ALERTAS = 2;
const BUSQUEDAS_GET_ON_BOARD = ['desarrollador', 'react', 'node', 'soporte', 'atención al cliente', 'ecommerce', 'qa', 'automatización'];

async function pedir(url) {
  const respuesta = await fetch(url, { headers: CABECERAS, signal: AbortSignal.timeout(ESPERA_MAXIMA_MS) });
  if (!respuesta.ok) throw new Error(`respondió ${respuesta.status}`);
  return respuesta;
}

const pedirJson = async url => (await pedir(url)).json();

// El RSS trae el HTML escapado (&lt;p&gt;): lo devolvemos a HTML para que normalizar.js pueda quitar las etiquetas.
// &amp; va al final para no decodificar dos veces ("&amp;lt;" tiene que quedar "&lt;").
function decodificar(texto) {
  return String(texto ?? '')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, codigo) => String.fromCodePoint(Number(codigo)))
    .replace(/&amp;/g, '&');
}

// Caracteres que Windows-1252 pone entre los bytes 0x80 y 0x9F (en los demás, byte = código Unicode).
const WINDOWS_1252 = {
  '€': 0x80, '‚': 0x82, 'ƒ': 0x83, '„': 0x84, '…': 0x85, '†': 0x86, '‡': 0x87,
  'ˆ': 0x88, '‰': 0x89, 'Š': 0x8a, '‹': 0x8b, 'Œ': 0x8c, 'Ž': 0x8e, '‘': 0x91,
  '’': 0x92, '“': 0x93, '”': 0x94, '•': 0x95, '–': 0x96, '—': 0x97, '˜': 0x98,
  '™': 0x99, 'š': 0x9a, '›': 0x9b, 'œ': 0x9c, 'ž': 0x9e, 'Ÿ': 0x9f,
};

// Una letra rota: un carácter de inicio (Ã, â, ð...) seguido de 1 a 3 de continuación
// (\u0080-¿, o los que Windows-1252 pone en ese lugar).
const LETRA_ROTA = new RegExp(`[\\u00c2-\\u00f4][\\u0080-\\u00bf${Object.keys(WINDOWS_1252).join('')}]{1,3}`, 'g');

/**
 * Arregla el texto "doble codificado" que manda RemoteOK ("tecnolÃ³gico" → "tecnológico"):
 * a cada letra rota le rearma los bytes originales y los lee como UTF-8.
 * Lo que no forma una letra válida (y el texto que ya estaba bien) queda como estaba.
 */
function arreglarAcentos(texto) {
  if (typeof texto !== 'string') return texto;
  return texto.replace(LETRA_ROTA, rota => {
    const bytes = [...rota].map(caracter => WINDOWS_1252[caracter] ?? caracter.codePointAt(0));
    const letra = Buffer.from(bytes).toString('utf8');
    return [...letra].length === 1 && letra !== '�' ? letra : rota;
  });
}

/**
 * Lee un RSS y devuelve sus items con los mismos campos que el nodo "RSS Read" de n8n.
 * @returns {{ title: string, link: string, content: string, isoDate: string }[]}
 */
function leerRss(xml) {
  const items = [];
  for (const [, item] of String(xml).matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    const campo = etiqueta => {
      const valor = item.match(new RegExp(`<${etiqueta}>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?</${etiqueta}>`))?.[1];
      return decodificar(valor).trim();
    };
    const fecha = new Date(campo('pubDate'));
    items.push({
      title: campo('title'),
      link: campo('link'),
      content: campo('description'),
      isoDate: Number.isNaN(fecha.getTime()) ? '' : fecha.toISOString(),
    });
  }
  return items;
}

// Cada fuente devuelve lo mismo que su nodo en n8n; normalizar.js sabe leer todas.
// Get on Board va una vez por búsqueda: si una falla, las otras siguen.
const PORTALES = [
  {
    nombre: 'RemoteOK',
    bajar: async () => (await pedirJson('https://remoteok.com/api')).map(oferta => ({
      ...oferta, position: arreglarAcentos(oferta.position), company: arreglarAcentos(oferta.company),
      location: arreglarAcentos(oferta.location), description: arreglarAcentos(oferta.description),
    })),
  },
  { nombre: 'Remotive', bajar: () => pedirJson('https://remotive.com/api/remote-jobs') },
  { nombre: 'Himalayas', bajar: () => pedirJson('https://himalayas.app/jobs/api/search?country=AR&limit=100') },
  { nombre: 'Working Nomads', bajar: () => pedirJson('https://www.workingnomads.com/api/exposed_jobs/') },
  { nombre: 'We Work Remotely', bajar: async () => leerRss(await (await pedir('https://weworkremotely.com/remote-jobs.rss')).text()) },
  ...BUSQUEDAS_GET_ON_BOARD.map(q => ({
    nombre: `Get on Board (${q})`,
    bajar: () => pedirJson(`https://www.getonbrd.com/api/v0/search/jobs?query=${encodeURIComponent(q)}&per_page=50&remote=true&expand=%5B%22company%22%5D`),
  })),
];

const ALERTAS = {
  nombre: 'Alertas de LinkedIn (Gmail)',
  // Sin .env no hay alertas, pero la búsqueda sigue (igual que antes).
  bajar: async () => (hayCredenciales() ? leerAlertas(DIAS_DE_ALERTAS) : []),
};

/**
 * Baja todas las fuentes a la vez. Las que fallan quedan en `errores` y no frenan a las demás.
 * @param {{ nombre: string, bajar: () => Promise<object | object[]> }[]} fuentes
 * @returns {Promise<{ items: { json: object }[], errores: string[], respondieron: number }>}
 */
async function bajarFuentes(fuentes) {
  const resultados = await Promise.allSettled(fuentes.map(fuente => fuente.bajar()));
  const items = [];
  const errores = [];
  resultados.forEach((resultado, i) => {
    if (resultado.status === 'rejected') {
      errores.push(`${fuentes[i].nombre}: ${resultado.reason?.message ?? resultado.reason}`);
      return;
    }
    const valor = resultado.value;
    for (const json of Array.isArray(valor) ? valor : [valor]) items.push({ json });
  });
  return { items, errores, respondieron: fuentes.length - errores.length };
}

// El código de normalizar.js es el del nodo "Normalizar y prefiltrar" de n8n, que recibe los items en $input.
const normalizar = new Function('$input', fs.readFileSync(path.join(__dirname, 'normalizar.js'), 'utf8'));

/**
 * Corre la búsqueda completa y devuelve el resumen de evaluar.js.
 * Si no respondió ninguna fuente (por ejemplo, sin internet) lanza un error y no anota la búsqueda:
 * así la app lo vuelve a intentar en la próxima vuelta en vez de esperar 12 horas.
 */
async function buscar({ fuentes = [...PORTALES, ALERTAS] } = {}) {
  const { items, errores, respondieron } = await bajarFuentes(fuentes);
  if (respondieron === 0) throw new Error(`No respondió ninguna fuente. ${errores.join(' · ')}`);

  const ofertas = normalizar({ all: () => items }).map(item => item.json);
  fs.mkdirSync(path.dirname(ENTRADA), { recursive: true });
  fs.writeFileSync(ENTRADA, JSON.stringify(ofertas));

  const { evaluar } = require('../evaluar');
  return evaluar({ erroresFuentes: errores });
}

if (require.main === module) {
  buscar().then(resumen => console.log(JSON.stringify(resumen))).catch(e => {
    console.error(e.message);
    process.exit(1);
  });
}

module.exports = { buscar, bajarFuentes, leerRss, decodificar, arreglarAcentos };
