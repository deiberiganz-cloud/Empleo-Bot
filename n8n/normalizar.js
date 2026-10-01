// Convierte la respuesta de cada portal al mismo formato y aplica el prefiltro (0 tokens).
const limpiar = h => String(h || '').replace(/<[^>]+>/g, ' ').replace(/&[a-z#0-9]+;/gi, ' ').replace(/\s+/g, ' ').trim();
const SENIOR = /\b(senior|sr\.?|semi ?senior|ssr|lead|staff|principal|manager|director|head of|architect|arquitect[oa]|jefe|gerente)\b/i;
const INGLES = /(fluent|advanced|excellent|native|proficient|strong|professional|business|c1|c2|b2)[^.]{0,25}english|english[^.]{0,20}(fluen|advanced|c1|c2|b2|required|proficien)|ingl[eé]s[^.]{0,15}(avanzado|fluido|intermedio|conversacional|c1|c2|b2|excluyente)|\(ingl[eé]s\)/i;
const HISPANO = /spanish|español|espanol|latam|latin america|latinoam[eé]rica|argentina|south america|sudam[eé]rica|hispan/i;
// Get on Board manda la modalidad como código ("fully_remote"): la pasamos a texto legible.
const MODALIDAD = { fully_remote: 'Remoto', remote_local: 'Remoto (con restricción de país)', hybrid: 'Híbrido', no_remote: 'Presencial' };

const ofertas = [];
for (const { json: j } of $input.all()) {
  if (j.legal) continue;
  // Las alertas de Gmail (leer-alertas.js) ya llegan con el formato común.
  if (j.fuente === 'LinkedIn (alerta)') { ofertas.push(j); continue; }
  if (Array.isArray(j.jobs) && j['job-count'] !== undefined) {
    for (const x of j.jobs) ofertas.push({ fuente: 'Remotive', titulo: x.title, empresa: x.company_name, url: x.url,
      ubicacion: x.candidate_required_location, descripcion: limpiar(x.description), fecha: String(x.publication_date).slice(0, 10) });
  } else if (Array.isArray(j.jobs)) {
    for (const x of j.jobs) ofertas.push({ fuente: 'Himalayas', titulo: x.title, empresa: x.companyName, url: x.applicationLink || x.guid,
      ubicacion: (x.locationRestrictions || []).join(', ') || 'Worldwide', descripcion: limpiar(`${x.excerpt} ${x.description}`), fecha: String(x.pubDate).slice(0, 10) });
  } else if (Array.isArray(j.data)) {
    for (const x of j.data) {
      const a = x.attributes;
      ofertas.push({ fuente: 'Get on Board', titulo: a.title, empresa: a.company?.data?.attributes?.name || '', url: x.links?.public_url,
        ubicacion: [MODALIDAD[a.remote_modality] ?? a.remote_modality, ...(a.countries || []).filter(p => p !== 'Remote')].join(' · '), descripcion: limpiar([a.description, a.functions, a.desirable].join(' ')),
        fecha: new Date(a.published_at * 1000).toISOString().slice(0, 10) });
    }
  } else if (j.position) {
    ofertas.push({ fuente: 'RemoteOK', titulo: j.position, empresa: j.company, url: j.url, ubicacion: j.location || 'Worldwide',
      descripcion: limpiar(j.description), fecha: String(j.date).slice(0, 10) });
  } else if (j.company_name && j.pub_date !== undefined) {
    ofertas.push({ fuente: 'Working Nomads', titulo: j.title, empresa: j.company_name, url: j.url, ubicacion: j.location || 'Worldwide',
      descripcion: limpiar(j.description), fecha: String(j.pub_date).slice(0, 10) });
  } else if (j.link) {
    const partes = String(j.title).split(': ');
    ofertas.push({ fuente: 'We Work Remotely', titulo: partes.length > 1 ? partes.slice(1).join(': ') : j.title, empresa: partes.length > 1 ? partes[0] : '',
      url: j.link, ubicacion: '', descripcion: limpiar(j.content || j.contentSnippet), fecha: String(j.isoDate).slice(0, 10) });
  }
}

const vistas = new Set();
const pasan = ofertas.filter(o => {
  if (!o.url || vistas.has(o.url)) return false;
  vistas.add(o.url);
  const texto = `${o.titulo} ${o.ubicacion} ${o.descripcion}`;
  if (SENIOR.test(o.titulo) || INGLES.test(texto)) return false;
  // Get on Board y las alertas de LinkedIn ya vienen filtradas para Argentina/LATAM.
  return o.fuente === 'Get on Board' || o.fuente === 'LinkedIn (alerta)' || HISPANO.test(texto);
});
return pasan.map(o => ({ json: o }));
