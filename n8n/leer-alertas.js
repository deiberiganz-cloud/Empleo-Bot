// Lee de Gmail (IMAP) las alertas de empleo de LinkedIn de los últimos días y las imprime
// como JSON, en el mismo formato que los portales, para que n8n las sume a la búsqueda.
// Abre el buzón en modo solo lectura: no borra, no mueve y no marca nada como leído.
// Uso: node n8n/leer-alertas.js [días]   (por defecto, 2)
const { hayCredenciales, conGmail, leerTexto } = require('./gmail');

const REMITENTES = ['jobalerts-noreply@linkedin.com', 'jobs-noreply@linkedin.com'];
const FUENTE = 'LinkedIn (alerta)';
// Líneas de la tarjeta que no son título, empresa ni lugar.
const RUIDO = /^(solicitar con perfil|esta empresa busca|\d+ personas? (estudi|trabaj)|ver anuncio|promocionado|nuevo$|sé uno de los|se ha enviado tu solicitud|your application was sent)/i;

// Recorre el texto plano del correo: cada oferta termina en la línea "Ver anuncio de empleo: <link>".
function extraerOfertas(texto, fecha) {
  const ofertas = [];
  let tarjeta = [];
  for (const cruda of String(texto).split(/\r?\n/)) {
    const linea = cruda.trim();
    const id = linea.match(/linkedin\.com\/comm\/jobs\/view\/(\d+)/)?.[1];
    if (id) {
      const [titulo, empresa, ubicacion] = tarjeta;
      if (titulo && empresa) {
        ofertas.push({
          fuente: FUENTE,
          titulo,
          empresa,
          // El link del correo trae tokens de inicio de sesión: guardamos solo el link limpio.
          url: `https://www.linkedin.com/jobs/view/${id}/`,
          ubicacion: ubicacion || '',
          descripcion: 'Alerta de LinkedIn: el correo no trae la descripción completa.',
          fecha,
        });
      }
      tarjeta = [];
    } else if (/^-{5,}$/.test(linea) || /https?:\/\//.test(linea)) {
      tarjeta = [];
    } else if (linea && !RUIDO.test(linea)) {
      tarjeta.push(linea);
    }
  }
  return ofertas;
}

async function leerAlertas(dias) {
  return conGmail(async cliente => {
    const desde = new Date(Date.now() - dias * 864e5);
    const uids = await cliente.search({ since: desde, gmailRaw: `from:(${REMITENTES.join(' OR ')})` }, { uid: true });
    const ofertas = [];
    const vistas = new Set();
    for (const uid of uids) {
      const { texto, fecha } = await leerTexto(cliente, uid);
      for (const o of extraerOfertas(texto, fecha.toISOString().slice(0, 10))) {
        if (vistas.has(o.url)) continue;
        vistas.add(o.url);
        ofertas.push(o);
      }
    }
    return ofertas;
  });
}

async function main() {
  if (!hayCredenciales()) {
    // Sin credenciales no cortamos la búsqueda diaria: devolvemos cero alertas y avisamos.
    console.error('Falta GMAIL_USUARIO o GMAIL_CLAVE_APP en .env: se saltean las alertas de Gmail.');
    console.log('[]');
    return;
  }
  const dias = Number(process.argv[2]) || 2;
  console.log(JSON.stringify(await leerAlertas(dias)));
}

if (require.main === module) {
  main().catch(e => { console.error('No se pudieron leer las alertas de Gmail:', e.message); process.exit(1); });
}

module.exports = { extraerOfertas };
