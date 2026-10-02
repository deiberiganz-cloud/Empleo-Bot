const test = require('node:test');
const assert = require('node:assert');
const { normalizar } = require('./normalizar');

const AHORA = new Date('2026-10-02T12:00:00Z');

// Respuestas con la misma forma que las reales de cada portal (datos inventados).
const remoteOk = [
  { legal: 'Aviso legal de la API' },
  { position: 'Soporte técnico', company: 'Uno', url: 'https://remoteok.com/1', location: 'LATAM', description: '<p>Remoto para Argentina</p>', date: '2026-10-01T10:00:00+00:00' },
  { position: 'Senior Developer', company: 'Dos', url: 'https://remoteok.com/2', location: 'LATAM', description: 'Argentina', date: '2026-10-01' },
];
const getOnBoard = {
  data: [{
    attributes: { title: 'Desarrollador Node', remote_modality: 'fully_remote', countries: ['Remote', 'Chile'],
      description: '<b>Backend</b>', functions: '', desirable: '', published_at: 1790000000,
      company: { data: { attributes: { name: 'Tres' } } } },
    links: { public_url: 'https://getonbrd.com/3' },
  }],
};
const alerta = { fuente: 'LinkedIn (alerta)', titulo: 'QA Tester', empresa: 'Cuatro', url: 'https://www.linkedin.com/jobs/view/4/', ubicacion: 'Argentina', descripcion: '', fecha: '2026-10-02' };

test('pasa cada portal al formato común y aplica el prefiltro', () => {
  const ofertas = normalizar([...remoteOk, getOnBoard, alerta], AHORA);
  assert.deepStrictEqual(ofertas.map(o => o.titulo), ['Soporte técnico', 'Desarrollador Node', 'QA Tester']);
  assert.deepStrictEqual(ofertas[0], {
    fuente: 'RemoteOK', titulo: 'Soporte técnico', empresa: 'Uno', url: 'https://remoteok.com/1',
    ubicacion: 'LATAM', descripcion: 'Remoto para Argentina', fecha: '2026-10-01',
  });
  assert.strictEqual(ofertas[1].ubicacion, 'Remoto · Chile');
  assert.strictEqual(ofertas[1].empresa, 'Tres');
});

test('descarta las repetidas, las que piden inglés avanzado y las que no aceptan LATAM', () => {
  const ofertas = normalizar([
    { position: 'Soporte', company: 'A', url: 'https://x/1', description: 'Argentina', date: '2026-10-01' },
    { position: 'Soporte', company: 'A', url: 'https://x/1', description: 'Argentina', date: '2026-10-01' },
    { position: 'Soporte', company: 'B', url: 'https://x/2', description: 'Argentina, fluent English required', date: '2026-10-01' },
    { position: 'Soporte', company: 'C', url: 'https://x/3', location: 'USA only', description: 'Remote', date: '2026-10-01' },
  ], AHORA);
  assert.deepStrictEqual(ofertas.map(o => o.url), ['https://x/1']);
});

test('descarta los avisos de más de 30 días y deja pasar los que no tienen fecha', () => {
  const aviso = (url, date) => ({ position: 'Soporte', company: 'A', url, description: 'Argentina', date });
  const ofertas = normalizar([
    aviso('https://x/hoy', '2026-10-02T09:00:00+00:00'),
    aviso('https://x/30-dias', '2026-09-02'),
    aviso('https://x/31-dias', '2026-09-01'),
    aviso('https://x/2025', '2025-10-13'),
    aviso('https://x/sin-fecha', undefined),
  ], AHORA);
  assert.deepStrictEqual(ofertas.map(o => o.url), ['https://x/hoy', 'https://x/30-dias', 'https://x/sin-fecha']);
});

test('la fecha de Himalayas (segundos Unix) queda como AAAA-MM-DD', () => {
  const [oferta] = normalizar([{ jobs: [{ title: 'Soporte', companyName: 'H', applicationLink: 'https://h/1',
    locationRestrictions: ['Argentina'], excerpt: '', description: '', pubDate: 1790970934 }] }], AHORA);
  assert.strictEqual(oferta.fecha, '2026-10-02');
});
