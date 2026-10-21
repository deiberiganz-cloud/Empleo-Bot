const test = require('node:test');
const assert = require('node:assert');
const { extraerOfertas } = require('./leer-alertas');

// Texto con la misma forma que una alerta real de LinkedIn (datos inventados).
const CORREO = `Tu alerta de empleo para Desarrollador en Argentina
Gestionar tus alertas de empleo: https://www.linkedin.com/comm/jobs/alerts?midToken=abc

Desarrollador Node.js
Empresa Uno
Argentina

3 personas estudiaron en la misma institución educativa que tú
Solicitar con perfil y CV
Ver anuncio de empleo: https://www.linkedin.com/comm/jobs/view/111/?trackingId=x&otpToken=SECRETO

---------------------------------------------------------

Soporte Técnico
Empresa Dos
Buenos Aires y alrededores
Esta empresa busca personal activamente
Ver anuncio de empleo: https://www.linkedin.com/comm/jobs/view/222/?otpToken=SECRETO

----------------------------------------
Crear una alerta de empleo: https://www.linkedin.com/comm/jobs/alerts`;

test('saca título, empresa, lugar y link de cada oferta', () => {
  const ofertas = extraerOfertas(CORREO, '2026-10-01');
  assert.strictEqual(ofertas.length, 2);
  assert.deepStrictEqual(ofertas[0], {
    fuente: 'LinkedIn (alerta)',
    titulo: 'Desarrollador Node.js',
    empresa: 'Empresa Uno',
    url: 'https://www.linkedin.com/jobs/view/111/',
    ubicacion: 'Argentina',
    descripcion: 'Alerta de LinkedIn: el correo no trae la descripción completa.',
    fecha: '2026-10-01',
  });
  assert.strictEqual(ofertas[1].ubicacion, 'Buenos Aires y alrededores');
});

test('nunca guarda los tokens de inicio de sesión del link', () => {
  for (const o of extraerOfertas(CORREO, '2026-10-01')) assert.ok(!o.url.includes('otpToken'));
});

test('un correo sin ofertas (aviso de LinkedIn) no devuelve nada', () => {
  assert.deepStrictEqual(extraerOfertas('¿Quieres seguir recibiendo alertas?\nSeguir: https://x', '2026-10-01'), []);
});

// Fragmentos recortados de correos reales (sin tokens ni datos personales).
const ALERTA_CON_OTRAS = `Tu alerta de empleo para atención al cliente en Argentina
5 nuevos empleos coinciden con tus preferencias.
Gestionar alertas: https://www.linkedin.com/comm/jobs/alerts?x

Student Onboarding Specialist
TripleTen
Buenos Aires

5 personas estudiaron en la misma institución educativa que tú
Ver anuncio de empleo: https://www.linkedin.com/comm/jobs/view/301/?x

---------------------------------------------------------

Ver todos los empleos en LinkedIn: https://www.linkedin.com/comm/jobs/search-results/?x

Nuevos empleos de tus otras alertas

<strong class="font-bold" style="font-weight: 600;">e-commerce</strong>

Google Ads Specialist (eCommerce)
ScaleJet | eCommerce Recruitment agency
Buenos Aires
Ver anuncio de empleo: https://www.linkedin.com/comm/jobs/view/302/?x

---------------------------------------------------------

Ver todos los empleos https://www.linkedin.com/jobs/search-results/?x
Editar alerta https://www.linkedin.com/jobs/jam/manage/1?x

Empleos de<strong class="font-bold" style="font-weight: 600;">«Desarrollador de aplicaciones»</strong> en Argentina

Senior Software Engineer - React Native - Consumer
Kraken
Argentina

Esta empresa busca personal activamente
Ver anuncio de empleo: https://www.linkedin.com/comm/jobs/view/303/?x`;

const GUARDADOS = `El empleo guardado de Allata sigue disponible.

Application Support Engineer
Allata
Buenos Aires, Provincia de Buenos Aires, Argentina

2 personas estudiaron en la misma institución educativa que tú
Ver anuncio de empleo: https://www.linkedin.com/comm/jobs/view/401?x

---------------------------------------------------------

Solicitar

https://www.linkedin.com/comm/jobs/view/401?x

Tus otros empleos guardados
Webmaster
CS Outsource
Argentina
Ver anuncio de empleo: https://www.linkedin.com/comm/jobs/view/402?x`;

const resumen = texto => extraerOfertas(texto, '2026-10-01').map(o => [o.titulo, o.empresa, o.ubicacion]);

test('los encabezados de "otras alertas" no corren título, empresa ni lugar', () => {
  assert.deepStrictEqual(resumen(ALERTA_CON_OTRAS), [
    ['Student Onboarding Specialist', 'TripleTen', 'Buenos Aires'],
    ['Google Ads Specialist (eCommerce)', 'ScaleJet | eCommerce Recruitment agency', 'Buenos Aires'],
    ['Senior Software Engineer - React Native - Consumer', 'Kraken', 'Argentina'],
  ]);
});

test('"El empleo guardado ... sigue disponible" y "Tus otros empleos guardados" no entran a la tarjeta', () => {
  assert.deepStrictEqual(resumen(GUARDADOS), [
    ['Application Support Engineer', 'Allata', 'Buenos Aires, Provincia de Buenos Aires, Argentina'],
    ['Webmaster', 'CS Outsource', 'Argentina'],
  ]);
});

test('no quedan etiquetas HTML en los datos', () => {
  for (const o of extraerOfertas(ALERTA_CON_OTRAS, '2026-10-01')) {
    assert.ok(!/<|>/.test(`${o.titulo}${o.empresa}${o.ubicacion}`));
  }
});
