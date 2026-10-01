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
