// Convierte la respuesta de cada portal al mismo formato y aplica el prefiltro (0 tokens):
// fuera los avisos viejos, los puestos senior, los que piden inglés avanzado y los que no aceptan Argentina/LATAM.
const limpiar = h => String(h || '').replace(/<[^>]+>/g, ' ').replace(/&[a-z#0-9]+;/gi, ' ').replace(/\s+/g, ' ').trim();
const SENIOR = /\b(senior|sr\.?|semi ?senior|ssr|lead|staff|principal|manager|director|head of|architect|arquitect[oa]|jefe|gerente)\b/i;
const INGLES = /(fluent|advanced|excellent|native|proficient|strong|professional|business|c1|c2|b2)[^.]{0,25}english|english[^.]{0,20}(fluen|advanced|c1|c2|b2|required|proficien)|ingl[eé]s[^.]{0,15}(avanzado|fluido|intermedio|conversacional|c1|c2|b2|excluyente)|\(ingl[eé]s\)/i;
const HISPANO = /spanish|español|espanol|latam|latin america|latinoam[eé]rica|argentina|south america|sudam[eé]rica|hispan/i;
// Un aviso publicado hace más de esto probablemente ya está cubierto: ni se le muestra a Claude.
const DIAS_MAXIMOS = 30;
const DIA = 24 * 60 * 60 * 1000;

/**
 * Pasa la fecha de un portal a "AAAA-MM-DD". Himalayas la manda en segundos Unix (1790970934);
 * los demás, como texto ISO ("2026-10-01T10:46:31-04:00").
 */
function fechaIso(valor) {
  if (/^\d{9,11}$/.test(String(valor))) return new Date(Number(valor) * 1000).toISOString().slice(0, 10);
  return String(valor).slice(0, 10);
}

/** true si el aviso se publicó hace más de DIAS_MAXIMOS. Sin fecha válida, se le da el beneficio de la duda. */
function esViejo(fecha, ahora) {
  const publicada = /^\d{4}-\d{2}-\d{2}$/.test(fecha) ? Date.parse(fecha) : NaN;
  // Se cuentan días enteros: un aviso de hace justo 30 días todavía pasa.
  const hoy = Date.parse(ahora.toISOString().slice(0, 10));
  return !Number.isNaN(publicada) && hoy - publicada > DIAS_MAXIMOS * DIA;
}

// Get on Board manda la modalidad como código ("fully_remote"): la pasamos a texto legible.
const MODALIDAD = { fully_remote: 'Remoto', remote_local: 'Remoto (con restricción de país)', hybrid: 'Híbrido', no_remote: 'Presencial' };

/**
 * Reconoce de qué portal es cada respuesta por su forma y la pasa al formato común.
 * @param {object} j una respuesta cruda (o un elemento de una lista, como en RemoteOK)
 * @returns {object[]} ofertas con { fuente, titulo, empresa, url, ubicacion, descripcion, fecha }
 */
function aOfertas(j) {
  if (j.legal) return [];
  // Las alertas de Gmail (leer-alertas.js) ya llegan con el formato común.
  if (j.fuente === 'LinkedIn (alerta)') return [j];
  if (Array.isArray(j.jobs) && j['job-count'] !== undefined) {
    return j.jobs.map(x => ({ fuente: 'Remotive', titulo: x.title, empresa: x.company_name, url: x.url,
      ubicacion: x.candidate_required_location, descripcion: limpiar(x.description), fecha: fechaIso(x.publication_date) }));
  }
  if (Array.isArray(j.jobs)) {
    return j.jobs.map(x => ({ fuente: 'Himalayas', titulo: x.title, empresa: x.companyName, url: x.applicationLink || x.guid,
      ubicacion: (x.locationRestrictions || []).join(', ') || 'Worldwide', descripcion: limpiar(`${x.excerpt} ${x.description}`), fecha: fechaIso(x.pubDate) }));
  }
  if (Array.isArray(j.data)) {
    return j.data.map(x => {
      const a = x.attributes;
      return { fuente: 'Get on Board', titulo: a.title, empresa: a.company?.data?.attributes?.name || '', url: x.links?.public_url,
        ubicacion: [MODALIDAD[a.remote_modality] ?? a.remote_modality, ...(a.countries || []).filter(p => p !== 'Remote')].join(' · '), descripcion: limpiar([a.description, a.functions, a.desirable].join(' ')),
        fecha: new Date(a.published_at * 1000).toISOString().slice(0, 10) };
    });
  }
  if (j.position) {
    return [{ fuente: 'RemoteOK', titulo: j.position, empresa: j.company, url: j.url, ubicacion: j.location || 'Worldwide',
      descripcion: limpiar(j.description), fecha: fechaIso(j.date) }];
  }
  if (j.company_name && j.pub_date !== undefined) {
    return [{ fuente: 'Working Nomads', titulo: j.title, empresa: j.company_name, url: j.url, ubicacion: j.location || 'Worldwide',
      descripcion: limpiar(j.description), fecha: fechaIso(j.pub_date) }];
  }
  if (j.link) {
    const partes = String(j.title).split(': ');
    return [{ fuente: 'We Work Remotely', titulo: partes.length > 1 ? partes.slice(1).join(': ') : j.title, empresa: partes.length > 1 ? partes[0] : '',
      url: j.link, ubicacion: '', descripcion: limpiar(j.content || j.contentSnippet), fecha: fechaIso(j.isoDate) }];
  }
  return [];
}

/**
 * Pasa las respuestas de todos los portales al formato común, saca las repetidas y aplica el prefiltro.
 * @param {object[]} respuestas lo que devolvió cada fuente (ver bajarFuentes en buscar.js)
 * @param {Date} ahora para calcular la antigüedad (los tests pasan una fecha fija)
 * @returns {object[]} las ofertas que pasan el prefiltro
 */
function normalizar(respuestas, ahora = new Date()) {
  const vistas = new Set();
  return respuestas.flatMap(aOfertas).filter(o => {
    if (!o.url || vistas.has(o.url)) return false;
    vistas.add(o.url);
    if (esViejo(o.fecha, ahora)) return false;
    const texto = `${o.titulo} ${o.ubicacion} ${o.descripcion}`;
    if (SENIOR.test(o.titulo) || INGLES.test(texto)) return false;
    // Get on Board y las alertas de LinkedIn ya vienen filtradas para Argentina/LATAM.
    return o.fuente === 'Get on Board' || o.fuente === 'LinkedIn (alerta)' || HISPANO.test(texto);
  });
}

module.exports = { normalizar, DIAS_MAXIMOS };
