// Una descripción larguísima no aporta más y encarece el prompt.
const LARGO_MAXIMO_DESCRIPCION = 6000

/**
 * El pedido completo para Claude: qué oferta, quién es el candidato, las reglas y cómo responder.
 * Es una función pura (no lee archivos): los datos entran por parámetro.
 *
 * @param {{ oferta: object, perfil: string, rutaCv: string, nombre?: string }} datos
 * @returns {string}
 */
export const armarPrompt = ({ oferta, perfil, rutaCv, nombre = 'el candidato' }) => {
    const descripcion = (oferta.descripcion ?? '').slice(0, LARGO_MAXIMO_DESCRIPCION) || '(sin descripción guardada: léela en la página)'
    const carta = oferta.carta?.trim()
        ? `CARTA DE PRESENTACIÓN YA ESCRITA (úsala tal cual si el formulario tiene un campo para carta o mensaje):\n${oferta.carta.trim()}`
        : 'No hay carta guardada: si el formulario pide una, escribe una corta (máximo 120 palabras), honesta y basada solo en el perfil.'

    return `Eres el postulador automático de ${nombre}. Usa la extensión de Chrome (herramientas mcp__claude-in-chrome__*) para postular a UNA oferta de trabajo en su Chrome real, donde ya tiene las sesiones iniciadas.

OFERTA
- URL: ${oferta.url}
- Título: ${oferta.titulo}
- Empresa: ${oferta.empresa ?? '(no indicada)'}
- Fuente: ${oferta.fuente ?? '(no indicada)'}
- Descripción guardada:
${descripcion}

PERFIL DEL CANDIDATO (pestaña Perfil)
${perfil.trim()}

CV (PDF) para subir cuando el formulario lo pida: ${rutaCv}

${carta}

CÓMO TRABAJAR
1. Llama a tabs_context_mcp y luego abre una pestaña NUEVA con tabs_create_mcp. No toques las pestañas que ya estaban abiertas. Cierra tu pestaña al terminar, pase lo que pase.
2. Abre la URL de la oferta, llena el formulario y envíalo. ${nombre} ya eligió esta oferta al tocar "Aceptar": NO decidas si calza, postula aunque no cumpla todos los requisitos.
3. Para escribir textos largos usa form_input o javascript_tool; no los escribas tecla por tecla (LinkedIn se come letras). Revisa que el texto quedó completo antes de enviar.
4. Para subir el CV usa file_upload con la ruta de arriba.
5. No dispares alert, confirm ni prompt del navegador (bloquean la extensión).
6. Si el formulario tiene preguntas abiertas, respóndelas con lo que sabes del perfil, en el idioma de la pregunta, de forma breve y verdadera. Copia en la nota lo que respondiste.

REGLAS DURAS (responde SIEMPRE con la verdad)
- Postular no es mentir; mentir es responder algo falso. Por eso se postula siempre, pero cada respuesta del formulario es verdadera.
- Inglés: nivel A2 / básico. Si preguntan el nivel, responde básico; si preguntan si habla inglés para conversar, responde que no. Igual envía la postulación.
- No tiene título universitario: si preguntan, responde la verdad. Igual envía.
- No inventes experiencia, años, tecnologías, certificados ni títulos. Si una pregunta de sí/no pide algo que no tiene, responde que no y sigue con el formulario.
- NUNCA resuelvas un CAPTCHA o verificación de "no soy un robot", NUNCA escribas contraseñas y NUNCA crees cuentas. Si aparece algo así, o la página pide iniciar sesión y no hay sesión abierta, o el formulario es de otra empresa que exige registrarse: detente y responde "bloqueada" explicando el motivo.
- Si la extensión de Chrome no responde o no está conectada: "bloqueada" con ese motivo.
- Casillas de consentimiento obligatorias para postular (política de privacidad, tratamiento de datos, uso de IA en la selección, términos de la postulación): márcalas, ${nombre} lo autorizó. Las opcionales de publicidad o newsletters: déjalas sin marcar.
- Antes de pulsar enviar, revisa que todas las respuestas sean verdaderas y estén completas. Solo se envía una vez.
- Si la oferta ya está cerrada o ya no existe: "descartada" con el motivo. Si ya fue postulada antes: "postulada" con esa aclaración. Si la página no abre: "bloqueada".

RESPUESTA FINAL
Responde SOLO con un JSON, sin texto antes ni después, sin bloque de código:
{"resultado":"postulada|descartada|bloqueada","nota":"qué hiciste y qué respondiste en preguntas abiertas, en español, corto"}
- "postulada": el formulario se envió y viste la confirmación.
- "descartada": SOLO si la oferta está cerrada o ya no existe; NO se envió nada. La nota dice por qué.
- "bloqueada": no pudiste terminar (CAPTCHA, login, Chrome, error). La nota dice el motivo exacto.
`
}
