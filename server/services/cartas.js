import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { preguntarAClaude } from './claude.js'

const RUTA_PERFIL = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'perfil.md')

const SISTEMA =
    'Sos un asesor de empleo que escribe cartas de presentación en español neutro y profesional.' +
    'Respondé SOLO con el texto de la carta, sin títulos, sin comillas y sin comentarios antes o después.'

const REGLAS = `
## Reglas para la carta
- Entre 150 y 200 palabras. Un saludo corto, 2 o 3 párrafos breves y una despedida con el nombre del candidato.
- NADA inventado: usá solo experiencia, proyectos y tecnologías que estén en el perfil.
- Si la oferta pide algo que el candidato no tiene, no lo afirmes: podés decir que lo está aprendiendo o que se adapta rápido, sin exagerar.
- Nunca digas que su inglés es más que básico. Si la oferta es en inglés, igual escribí la carta en español.
- Conectá 2 o 3 cosas que pide la oferta con cosas concretas del perfil (proyectos, experiencia en e-commerce, herramientas).
- Tono profesional y cercano. Prohibidas las frases de plantilla ("Por medio de la presente", "Me dirijo a ustedes", "Quedo a su entera disposición").
- Si se conoce el nombre de la empresa, usalo.`

const SISTEMA_SEGUIMIENTO =
    'Sos un asesor de empleo que escribe mensajes breves de seguimiento de una postulación, en español neutro y profesional. ' +
    'Respondé SOLO con el texto del mensaje, sin asunto, sin comillas y sin comentarios.'

const REGLAS_SEGUIMIENTO = `
## Reglas para el mensaje
- Entre 50 y 90 palabras: se manda por mail o por LinkedIn a quien publicó la búsqueda.
- Cuenta que el candidato se postuló hace unos días al puesto, que sigue muy interesado y pregunta con amabilidad cómo sigue el proceso.
- Puede recordar en una frase por qué encaja (algo concreto del perfil que pide la oferta). Nada inventado.
- Sin presionar ni reclamar. Sin frases de plantilla. Termina con el nombre del candidato.`

/**
 * Arma el escritor de cartas. Recibe cómo leer el perfil y cómo preguntarle a Claude
 * (inyección): en los tests se pasa un "Claude de mentira" y no se gasta la suscripción.
 */
export const crearEscritorDeCartas = ({
    leerPerfil = () => fs.readFileSync(RUTA_PERFIL, 'utf8'),
    preguntar = preguntarAClaude,
} = {}) => async oferta => {
    const datosOferta = [
        `Puesto: ${oferta.titulo}`,
        oferta.empresa && `Empresa: ${oferta.empresa}`,
        oferta.ubicacion && `Ubicación: ${oferta.ubicacion}`,
        `Descripción: ${(oferta.descripcion || 'Sin descripción').slice(0, 4000)}`,
    ].filter(Boolean).join('\n')

    const prompt = `${leerPerfil()}\n\n## Oferta\n${datosOferta}\n${REGLAS}`
    const carta = await preguntar(prompt, { sistema: SISTEMA })
    if (!carta) throw new Error('Claude devolvió una carta vacía')
    return carta
}

/**
 * Arma el escritor de mensajes de seguimiento (para cuando una postulación lleva días sin respuesta).
 * Igual que el de cartas: perfil y Claude se inyectan para poder probarlo sin gastar la suscripción.
 */
export const crearEscritorDeSeguimiento = ({
    leerPerfil = () => fs.readFileSync(RUTA_PERFIL, 'utf8'),
    preguntar = preguntarAClaude,
} = {}) => async oferta => {
    const dias = oferta.fecha_postulacion
        ? Math.max(1, Math.round((Date.now() - new Date(oferta.fecha_postulacion).getTime()) / 86400000))
        : null
    const datosOferta = [
        `Puesto: ${oferta.titulo}`,
        oferta.empresa && `Empresa: ${oferta.empresa}`,
        dias && `Se postuló hace ${dias} días`,
        `Descripción: ${(oferta.descripcion || 'Sin descripción').slice(0, 2000)}`,
    ].filter(Boolean).join('\n')

    const prompt = `${leerPerfil()}\n\n## Postulación\n${datosOferta}\n${REGLAS_SEGUIMIENTO}`
    const mensaje = await preguntar(prompt, { sistema: SISTEMA_SEGUIMIENTO })
    if (!mensaje) throw new Error('Claude devolvió un mensaje vacío')
    return mensaje
}
