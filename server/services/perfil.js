// Reglas del perfil del candidato (la pestaña Perfil): cómo es un perfil válido y cómo se le
// cuenta a Claude. Son funciones puras: no leen la base ni archivos, así se prueban fáciles.

const LARGO_MAXIMO = 4000
const MAXIMO_ITEMS = 50

/** Un perfil vacío: todos los campos que existen, con su forma. */
export const PERFIL_VACIO = Object.freeze({
    personales: {
        nombre: '', fechaNacimiento: '', ciudad: '', provincia: '', pais: '',
        direccion: '', codigoPostal: '', dni: '', telefono: '', email: '',
    },
    links: [],
    titulo: '',
    presentacion: '',
    habilidades: [],
    experiencias: [],
    idiomas: [],
    busqueda: {
        puestos: [], modalidad: '', paises: '', sueldo: '', moneda: '',
        disponibilidad: '', seniority: '', noSirve: '',
    },
    respuestas: [],
})

const texto = valor => (typeof valor === 'string' ? valor.trim().slice(0, LARGO_MAXIMO) : '')
const lista = valor => (Array.isArray(valor) ? valor.slice(0, MAXIMO_ITEMS) : [])
// Toma solo los campos conocidos de un objeto, todos como texto.
const soloCampos = (valor, campos) =>
    Object.fromEntries(campos.map(campo => [campo, texto(valor?.[campo])]))

/**
 * Deja el perfil con la forma de PERFIL_VACIO: descarta lo que no se conoce, recorta textos largos
 * y saca de las listas los ítems vacíos. Lo que manda la pantalla pasa siempre por acá antes de guardarse.
 * @param {unknown} datos
 */
export const normalizarPerfil = datos => {
    const d = datos && typeof datos === 'object' ? datos : {}
    return {
        personales: soloCampos(d.personales, Object.keys(PERFIL_VACIO.personales)),
        links: lista(d.links).map(link => soloCampos(link, ['nombre', 'url'])).filter(link => link.url),
        titulo: texto(d.titulo),
        presentacion: texto(d.presentacion),
        habilidades: lista(d.habilidades).map(texto).filter(Boolean),
        experiencias: lista(d.experiencias)
            .map(exp => ({ ...soloCampos(exp, ['titulo', 'lugar', 'desde', 'hasta', 'descripcion']), tipo: exp?.tipo === 'estudio' ? 'estudio' : 'trabajo' }))
            .filter(exp => exp.titulo || exp.lugar),
        idiomas: lista(d.idiomas).map(idioma => soloCampos(idioma, ['idioma', 'nivel'])).filter(idioma => idioma.idioma),
        busqueda: {
            ...soloCampos(d.busqueda, Object.keys(PERFIL_VACIO.busqueda).filter(campo => campo !== 'puestos')),
            puestos: lista(d.busqueda?.puestos).map(texto).filter(Boolean),
        },
        respuestas: lista(d.respuestas).map(r => soloCampos(r, ['pregunta', 'respuesta'])).filter(r => r.pregunta && r.respuesta),
    }
}

/** true si el perfil no tiene ni un dato cargado (todavía no se usó la pestaña). */
export const perfilVacio = perfil =>
    JSON.stringify(normalizarPerfil(perfil)) === JSON.stringify(normalizarPerfil(PERFIL_VACIO))

const periodo = exp => [exp.desde, exp.hasta].filter(Boolean).join(' – ')

/**
 * El perfil como texto para Claude (evaluar ofertas, escribir cartas y postular).
 * Reemplaza al viejo perfil.md: mismos títulos, armado con lo que se cargó en la pestaña.
 * @param {ReturnType<typeof normalizarPerfil>} perfil
 */
export const perfilATexto = perfil => {
    const p = normalizarPerfil(perfil)
    const { personales: yo, busqueda } = p
    const linea = (etiqueta, valor) => (valor ? `- ${etiqueta}: ${valor}` : null)
    const seccion = (titulo, lineas) => {
        const llenas = lineas.filter(Boolean)
        return llenas.length ? `## ${titulo}\n${llenas.join('\n')}` : null
    }
    const trabajos = p.experiencias.filter(exp => exp.tipo === 'trabajo')
    const estudios = p.experiencias.filter(exp => exp.tipo === 'estudio')
    const item = exp => `- **${[exp.titulo, exp.lugar].filter(Boolean).join(' · ')}**${periodo(exp) ? ` (${periodo(exp)})` : ''}${exp.descripcion ? `: ${exp.descripcion}` : ''}`

    return [
        `# Perfil del candidato: ${yo.nombre || '(sin nombre)'}`,
        p.titulo && `**${p.titulo}**`,
        p.presentacion,
        seccion('Datos para formularios', [
            linea('Nombre completo', yo.nombre),
            linea('Fecha de nacimiento', yo.fechaNacimiento),
            linea('Dirección', [yo.direccion, yo.ciudad, yo.provincia, yo.pais].filter(Boolean).join(', ')),
            linea('Código postal', yo.codigoPostal),
            linea('DNI', yo.dni),
            linea('Teléfono (WhatsApp)', yo.telefono),
            linea('Email', yo.email),
            ...p.links.map(link => linea(link.nombre || 'Link', link.url)),
        ]),
        seccion('Habilidades', p.habilidades.length ? [`- ${p.habilidades.join(', ')}`] : []),
        seccion('Experiencia', trabajos.map(item)),
        seccion('Estudios', estudios.map(item)),
        seccion('Idiomas', p.idiomas.map(idioma => `- ${idioma.idioma}: ${idioma.nivel || 'sin indicar'}`)),
        seccion('Puestos que le sirven (de mejor a menos preferido)', busqueda.puestos.map((puesto, i) => `${i + 1}. ${puesto}`)),
        seccion('Qué busca', [
            linea('Modalidad', busqueda.modalidad),
            linea('Países que acepta', busqueda.paises),
            linea('Sueldo pretendido', [busqueda.sueldo, busqueda.moneda].filter(Boolean).join(' ')),
            linea('Disponibilidad', busqueda.disponibilidad),
            linea('Seniority', busqueda.seniority),
        ]),
        seccion('Cuándo NO sirve', busqueda.noSirve ? [busqueda.noSirve] : []),
        seccion('Respuestas para formularios', p.respuestas.map(r => `- ${r.pregunta} → ${r.respuesta}`)),
        `## Cómo puntuar
- **80-100:** calza casi completo con su experiencia y su seniority.
- **60-79:** calza en lo principal y vale la pena postular aunque falte alguna tecnología aprendible o algo de experiencia.
- **40-59:** posible pero flojo (le faltan varias cosas pedidas).
- **0-39:** no sirve (ver "Cuándo NO sirve").
- Ante la duda, puntuar a favor de postular.`,
    ].filter(Boolean).join('\n\n')
}
