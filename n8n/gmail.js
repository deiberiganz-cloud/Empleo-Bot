// Conexión a Gmail por IMAP que comparten leer-alertas.js y leer-respuestas.js.
// Siempre en modo solo lectura: no borra, no mueve y no marca nada como leído.
const path = require('path');

const ENV = path.join(__dirname, '..', '.env');

/** Carga el .env y dice si están el usuario y la contraseña de aplicación. */
function hayCredenciales() {
  try { process.loadEnvFile(ENV); } catch { /* sin .env */ }
  return Boolean(process.env.GMAIL_USUARIO && process.env.GMAIL_CLAVE_APP);
}

/**
 * Abre la carpeta "Todos" (All Mail) en solo lectura, le pasa el cliente a `trabajo` y cierra la conexión.
 * Se usa "Todos" para encontrar también los correos archivados; su nombre cambia según el idioma.
 */
async function conGmail(trabajo) {
  const { ImapFlow } = require('imapflow');
  const cliente = new ImapFlow({
    host: 'imap.gmail.com', port: 993, secure: true, logger: false,
    auth: { user: process.env.GMAIL_USUARIO, pass: process.env.GMAIL_CLAVE_APP.replace(/\s/g, '') },
  });
  await cliente.connect();
  try {
    const carpetas = await cliente.list();
    const todos = carpetas.find(c => c.specialUse === '\\All')?.path || 'INBOX';
    const candado = await cliente.getMailboxLock(todos, { readOnly: true });
    try {
      return await trabajo(cliente);
    } finally {
      candado.release();
    }
  } finally {
    await cliente.logout();
  }
}

/** Baja un correo completo y devuelve su texto plano (o el HTML sin etiquetas si no trae texto). */
async function leerTexto(cliente, uid) {
  const { simpleParser } = require('mailparser');
  const { source } = await cliente.fetchOne(uid, { source: true }, { uid: true });
  const correo = await simpleParser(source);
  const texto = correo.text || String(correo.html || '').replace(/<[^>]+>/g, ' ');
  return { texto, fecha: correo.date || new Date() };
}

module.exports = { hayCredenciales, conGmail, leerTexto };
