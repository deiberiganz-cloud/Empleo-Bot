// Convierte la respuesta de cada portal al mismo formato y aplica el prefiltro (0 tokens):
// fuera los puestos senior, los que piden inglés avanzado y los que no aceptan Argentina/LATAM.
const limpiar = h => String(h || '').replace(/<[^>]+>/g, ' ').replace(/&[a-z#0-9]+;/gi, ' ').replace(/\s+/g, ' ').trim();
const SENIOR = /\b(senior|sr\.?|semi ?senior|ssr|lead|staff|principal|manager|director|head of|architect|arquitect[oa]|jefe|gerente)\b/i;
const INGLES = /(fluent|advanced|excellent|native|proficient|strong|professional|business|c1|c2|b2)[^.]{0,25}english|english[^.]{0,20}(fluen|advanced|c1|c2|b2|required|proficien)|ingl[eé]s[^.]{0,15}(avanzado|fluido|intermedio|conversacional|c1|c2|b2|excluyente)|\(ingl[eé]s\)/i;
const HISPANO = /spanish|español|espanol|latam|latin america|latinoam[eé]rica|argentina|south america|sudam[eé]rica|hispan/i;
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
      ubicacion: x.candidate_required_location, descripcion: limpiar(x.description), fecha: String(x.publication_date).slice(0, 10) }));
  }
  if (Array.isArray(j.jobs)) {
    return j.jobs.map(x => ({ fuente: 'Himalayas', titulo: x.title, empresa: x.companyName, url: x.applicationLink || x.guid,
      ubicacion: (x.locationRestrictions || []).join(', ') || 'Worldwide', descripcion: limpiar(`${x.excerpt} ${x.description}`), fecha: String(x.pubDate).slice(0, 10) }));
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
      descripcion: limpiar(j.description), fecha: String(j.date).slice(0, 10) }];
  }
  if (j.company_name && j.pub_date !== undefined) {
    return [{ fuente: 'Working Nomads', titulo: j.title, empresa: j.company_name, url: j.url, ubicacion: j.location || 'Worldwide',
      descripcion: limpiar(j.description), fecha: String(j.pub_date).slice(0, 10) }];
  }
  if (j.link) {
    const partes = String(j.title).split(': ');
    return [{ fuente: 'We Work Remotely', titulo: partes.length > 1 ? partes.slice(1).join(': ') : j.title, empresa: partes.length > 1 ? partes[0] : '',
      url: j.link, ubicacion: '', descripcion: limpiar(j.content || j.contentSnippet), fecha: String(j.isoDate).slice(0, 10) }];
  }
  return [];
}

/**
 * Pasa las respuestas de todos los portales al formato común, saca las repetidas y aplica el prefiltro.
 * @param {object[]} respuestas lo que devolvió cada fuente (ver bajarFuentes en buscar.js)
 * @returns {object[]} las ofertas que pasan el prefiltro
 */
function normalizar(respuestas) {
  const vistas = new Set();
  return respuestas.flatMap(aOfertas).filter(o => {
    if (!o.url || vistas.has(o.url)) return false;
    vistas.add(o.url);
    const texto = `${o.titulo} ${o.ubicacion} ${o.descripcion}`;
    if (SENIOR.test(o.titulo) || INGLES.test(texto)) return false;
    // Get on Board y las alertas de LinkedIn ya vienen filtradas para Argentina/LATAM.
    return o.fuente === 'Get on Board' || o.fuente === 'LinkedIn (alerta)' || HISPANO.test(texto);
  });
}

module.exports = { normalizar };
