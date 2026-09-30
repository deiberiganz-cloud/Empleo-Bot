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
