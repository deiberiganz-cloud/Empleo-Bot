// Niveles de seniority que el usuario elige en la pestaña Perfil ("Niveles que busco") y cómo se
// detectan en el título de un aviso. Es la única lista de niveles: la usan el prefiltro y el servidor.
const NIVELES = ['Trainee', 'Junior', 'Semi senior', 'Senior', 'Lead / Staff', 'Principal / Gerencia'];

// Sin \b porque no entiende las tildes ("práctica", "líder"): el límite de palabra es "no hay letra o número al lado".
const palabra = patron => new RegExp(`(?<![\\p{L}\\p{N}])(?:${patron})(?![\\p{L}\\p{N}])`, 'iu');

const SEMI_SENIOR = palabra('semi[ -]?senior|ssr|mid[ -]?level|mid|middle|pleno');
const PATRONES = [
  ['Trainee', palabra('trainee|pasante|intern|internship|pr[aá]ctica|practicante')],
  ['Junior', palabra('junior|jr')],
  ['Senior', palabra('senior|sr')],
  ['Lead / Staff', palabra('lead|tech lead|staff|l[ií]der t[eé]cnico')],
  ['Principal / Gerencia', palabra('principal|architect|arquitect[oa]|head of|director|manager|gerente|jefe')],
];

/**
 * Los niveles que menciona el título de un aviso, en el orden de NIVELES. Vacío si no dice ninguno.
 * "Semi senior" cuenta como Semi senior y no como Senior; "Senior / Lead" cuenta como los dos.
 * @param {string} titulo
 * @returns {string[]}
 */
function nivelesDelTitulo(titulo) {
  const texto = String(titulo || '');
  // Se saca "semi senior" antes de buscar "senior", si no el segundo lo contaría de nuevo.
  const sinSemi = texto.replace(/semi[ -]?senior/giu, ' ');
  const hallados = new Set(PATRONES.filter(([, patron]) => patron.test(sinSemi)).map(([nivel]) => nivel));
  if (SEMI_SENIOR.test(texto)) hallados.add('Semi senior');
  return NIVELES.filter(nivel => hallados.has(nivel));
}

/**
 * ¿El aviso pasa el filtro de nivel? Sin niveles elegidos pasa todo; un título que no dice nivel también;
 * si dice alguno, pasa solo si al menos uno de esos niveles está entre los elegidos.
 * @param {string} titulo
 * @param {string[]} niveles los niveles que busca el usuario
 */
function pasaNiveles(titulo, niveles) {
  if (!niveles || niveles.length === 0) return true;
  const detectados = nivelesDelTitulo(titulo);
  return detectados.length === 0 || detectados.some(nivel => niveles.includes(nivel));
}

module.exports = { NIVELES, nivelesDelTitulo, pasaNiveles };
