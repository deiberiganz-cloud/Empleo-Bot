const test = require('node:test');
const assert = require('node:assert');
const { NIVELES, nivelesDelTitulo, pasaNiveles } = require('./niveles');

test('detecta el nivel de cada palabra clave', () => {
  const casos = {
    'Desarrollador Trainee': ['Trainee'],
    'Pasante de sistemas': ['Trainee'],
    'Software Engineering Intern': ['Trainee'],
    'Práctica profesional QA': ['Trainee'],
    'Dev Jr.': ['Junior'],
    'Desarrollador Junior': ['Junior'],
    'Desarrollador Pleno': ['Semi senior'],
    'Mid-level Backend': ['Semi senior'],
    'Dev SSR': ['Semi senior'],
    'Senior Developer': ['Senior'],
    'Dev Sr': ['Senior'],
    'Tech Lead': ['Lead / Staff'],
    'Staff Engineer': ['Lead / Staff'],
    'Líder técnico': ['Lead / Staff'],
    'Arquitecta de software': ['Principal / Gerencia'],
    'Head of Engineering': ['Principal / Gerencia'],
    'Gerente de TI': ['Principal / Gerencia'],
  };
  for (const [titulo, esperado] of Object.entries(casos)) assert.deepStrictEqual(nivelesDelTitulo(titulo), esperado, titulo);
});

test('"Semi Senior" es Semi senior y no Senior (con espacio, guion o junto)', () => {
  for (const titulo of ['Desarrollador Semi Senior', 'Dev semi-senior', 'Dev Semisenior']) {
    assert.deepStrictEqual(nivelesDelTitulo(titulo), ['Semi senior'], titulo);
  }
});

test('un título puede tener varios niveles y las palabras sueltas no cuentan', () => {
  assert.deepStrictEqual(nivelesDelTitulo('Senior / Lead Developer'), ['Senior', 'Lead / Staff']);
  assert.deepStrictEqual(nivelesDelTitulo('Junior o Semi Senior'), ['Junior', 'Semi senior']);
  assert.deepStrictEqual(nivelesDelTitulo('Desarrollador Full Stack'), []);
  assert.deepStrictEqual(nivelesDelTitulo('Internal tools, Srinivas, Midland'), []);
});

test('sin niveles elegidos pasa todo; sin nivel en el título también', () => {
  assert.strictEqual(pasaNiveles('Senior Developer', []), true);
  assert.strictEqual(pasaNiveles('Principal Architect', undefined), true);
  assert.strictEqual(pasaNiveles('Desarrollador Full Stack', ['Junior']), true);
});

test('con niveles elegidos, pasa si alguno del título está elegido', () => {
  assert.strictEqual(pasaNiveles('Senior Developer', ['Junior', 'Semi senior']), false);
  assert.strictEqual(pasaNiveles('Dev Semi Senior', ['Senior']), false);
  assert.strictEqual(pasaNiveles('Dev Semi Senior', ['Semi senior']), true);
  assert.strictEqual(pasaNiveles('Senior / Lead', ['Senior']), true);
  assert.strictEqual(pasaNiveles('Head of Product', ['Lead / Staff']), false);
});

test('NIVELES está en el orden de la pestaña Perfil', () => {
  assert.deepStrictEqual(NIVELES, ['Trainee', 'Junior', 'Semi senior', 'Senior', 'Lead / Staff', 'Principal / Gerencia']);
});
