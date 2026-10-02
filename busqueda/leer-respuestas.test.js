const test = require('node:test');
const assert = require('node:assert');
const { procesar, elegirCandidatos, claveEmpresa, INTENTOS_MAXIMOS } = require('./leer-respuestas');

// Base en memoria con el mismo manager que usa la app.
async function nuevoManager() {
  const { conectarDB } = await import('../server/config/db.js');
  const { OfertasManager } = await import('../server/dao/OfertasManager.js');
  return new OfertasManager(conectarDB(':memory:'));
}

const oferta = (cambios = {}) => ({
  url: 'https://www.linkedin.com/jobs/view/111/', titulo: 'Full Stack Engineer', empresa: 'Retorna',
  fuente: 'LinkedIn (alerta)', encontrada: '2026-09-30', puntaje: 72, postular: true, ...cambios,
});

// Mismo formato que el correo real de LinkedIn (datos inventados).
const confirmacion = (id = '111', empresa = 'Retorna', messageId = '<conf@linkedin>') => ({
  messageId, de: 'LinkedIn <jobs-noreply@linkedin.com>', asunto: `Deiber, se ha enviado tu solicitud a ${empresa}`,
  fecha: new Date('2026-10-01T20:52:00Z'),
  texto: `Se ha enviado tu solicitud a ${empresa}.\nFull Stack Engineer\n${empresa}\nArgentina\n` +
    `Ver anuncio de empleo: https://www.linkedin.com/comm/jobs/view/${id}/?otpToken=SECRETO\n----------\n` +
    'Descubre otros empleos similares\nOtro Puesto\nOtra Empresa\nArgentina\n' +
    'Ver anuncio de empleo: https://www.linkedin.com/comm/jobs/view/999/\n',
});

const correoEmpresa = (cambios = {}) => ({
  messageId: '<rrhh@retorna>', de: 'Talento Retorna <rrhh@retorna.com>', asunto: 'Tu postulación',
  fecha: new Date('2026-10-03T12:00:00Z'), texto: 'Hola Deiber, ¿podés el jueves a las 15?', ...cambios,
});

const claudeQueDice = (tipo, resumen = 'Proponen entrevista el jueves a las 15.') => {
  const llamadas = [];
  const clasificar = async (o, c) => { llamadas.push(c.messageId); return { tipo, resumen }; };
  return { clasificar, llamadas };
};

test('la confirmación de LinkedIn pasa la oferta a postulada con la fecha del correo', async () => {
  const manager = await nuevoManager();
  manager.guardar(oferta());
  const { acciones } = await procesar([confirmacion()], manager, claudeQueDice('otro').clasificar);
  const guardada = manager.obtenerPorUrl('https://www.linkedin.com/jobs/view/111/');
  assert.strictEqual(guardada.estado, 'postulada');
  assert.strictEqual(guardada.fecha_postulacion, '2026-10-01T20:52:00.000Z');
  assert.match(guardada.notas, /LinkedIn confirmó/);
  assert.deepStrictEqual(acciones, [{ titulo: 'Full Stack Engineer', empresa: 'Retorna', accion: 'postulada' }]);
  // Las "similares" del mismo correo no se tocan.
  assert.strictEqual(manager.obtenerPorUrl('https://www.linkedin.com/jobs/view/999/'), null);
});

test('si te postulaste a algo que el bot no conocía, lo crea como postulada', async () => {
  const manager = await nuevoManager();
  await procesar([confirmacion('555', 'Nueva SA')], manager, claudeQueDice('otro').clasificar);
  const creada = manager.obtenerPorUrl('https://www.linkedin.com/jobs/view/555/');
  assert.strictEqual(creada.estado, 'postulada');
  assert.strictEqual(creada.empresa, 'Nueva SA');
});

test('un correo de la empresa pasa la oferta a entrevista y deja la nota de Claude', async () => {
  const manager = await nuevoManager();
  manager.guardar(oferta());
  await procesar([confirmacion(), correoEmpresa()], manager, claudeQueDice('entrevista').clasificar);
  const o = manager.obtenerPorUrl('https://www.linkedin.com/jobs/view/111/');
  assert.strictEqual(o.estado, 'entrevista');
  assert.match(o.notas, /🤖 03\/10: Proponen entrevista el jueves a las 15\./);
});

test('un rechazo cierra la postulación; "otro" solo deja nota y nunca hace retroceder', async () => {
  const manager = await nuevoManager();
  manager.guardar(oferta());
  const [o] = manager.listar();
  manager.cambiarEstado(o.id, 'entrevista');
  await procesar([correoEmpresa()], manager, claudeQueDice('otro', 'Vieron tu solicitud.').clasificar);
  assert.strictEqual(manager.obtenerPorId(o.id).estado, 'entrevista');
  await procesar([correoEmpresa({ messageId: '<no@retorna>' })], manager, claudeQueDice('rechazo', 'No siguen.').clasificar);
  assert.strictEqual(manager.obtenerPorId(o.id).estado, 'rechazada');
});

test('cada correo se procesa una sola vez, y si Claude falla se reintenta la próxima', async () => {
  const manager = await nuevoManager();
  manager.guardar(oferta());
  const [o] = manager.listar();
  manager.cambiarEstado(o.id, 'postulada');
  const falla = async () => { throw new Error('Claude tardó demasiado'); };
  const { errores } = await procesar([correoEmpresa()], manager, falla);
  assert.strictEqual(errores.length, 1);
  assert.strictEqual(manager.yaProcesado('<rrhh@retorna>'), false);

  const claude = claudeQueDice('entrevista');
  await procesar([correoEmpresa()], manager, claude.clasificar);
  await procesar([correoEmpresa()], manager, claude.clasificar);
  assert.deepStrictEqual(claude.llamadas, ['<rrhh@retorna>']);
});

test('si Claude falla 3 veces con el mismo correo, se deja de intentar', async () => {
  const manager = await nuevoManager();
  manager.guardar(oferta());
  const [o] = manager.listar();
  manager.cambiarEstado(o.id, 'postulada');
  let llamadas = 0;
  const falla = async () => { llamadas++; throw new Error('Tipo inesperado: quizas'); };

  for (let i = 1; i < INTENTOS_MAXIMOS; i++) {
    const { errores } = await procesar([correoEmpresa()], manager, falla);
    assert.match(errores[0], new RegExp(`intento ${i} de ${INTENTOS_MAXIMOS}`));
    assert.strictEqual(manager.yaProcesado('<rrhh@retorna>'), false);
  }
  const { errores } = await procesar([correoEmpresa()], manager, falla);
  assert.match(errores[0], /no se vuelve a intentar/);
  assert.strictEqual(manager.yaProcesado('<rrhh@retorna>'), true);

  // A partir de acá, ese correo ya no llega a Claude.
  await procesar([correoEmpresa()], manager, falla);
  assert.strictEqual(llamadas, INTENTOS_MAXIMOS);
});

test('elige solo confirmaciones y correos que nombran a una empresa en proceso', async () => {
  const manager = await nuevoManager();
  manager.guardar(oferta());
  const [o] = manager.listar();
  manager.cambiarEstado(o.id, 'postulada');
  const encabezados = [
    { messageId: '1', de: 'LinkedIn <jobs-noreply@linkedin.com>', asunto: 'Deiber, se ha enviado tu solicitud a Otra' },
    { messageId: '2', de: 'Talento <rrhh@retorna.com>', asunto: 'Novedades' },
    { messageId: '3', de: 'LinkedIn <jobalerts-noreply@linkedin.com>', asunto: 'Retorna busca personal' },
    { messageId: '4', de: 'Banco <info@banco.com>', asunto: 'Tu resumen' },
    { messageId: '5', de: 'LinkedIn <jobs-noreply@linkedin.com>', asunto: 'Retorna vio tu solicitud' },
  ];
  assert.deepStrictEqual(elegirCandidatos(encabezados, manager).map(c => c.messageId), ['1', '2', '5']);
});

test('claveEmpresa usa la primera palabra distintiva del nombre', () => {
  assert.strictEqual(claveEmpresa('Svitla Systems, Inc.'), 'svitla');
  assert.strictEqual(claveEmpresa('The Software Group'), null);
  assert.strictEqual(claveEmpresa('Tecnología Ágil SRL'), 'tecnologia');
});
