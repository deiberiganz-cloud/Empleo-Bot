# Paso 4: anima al robot y renderiza los cuadros (sprites) que usa la app en el encabezado.
# Cada animación es una función que, para un cuadro f, pone los huesos y los efectos en su lugar.
# La cámara mira en 3/4 y el robot camina hacia la derecha (la app lo espeja para ir a la izquierda).
# Estilo caricatura como la ficha: sombra plana en 2 tonos y contorno azul marino.
# Uso: blender -b modelo/robot-con-esqueleto.blend -P animar-robot.py -- <carpeta de salida> [nombre ...]
#      (con nombres, renderiza solo esos cuadros; sirve para probar)
import bpy, sys, math, random
from mathutils import Matrix, Vector

args = sys.argv[sys.argv.index('--') + 1:]
salida, solo = args[0], set(args[1:])
R = math.radians
sc = bpy.context.scene
arm = bpy.data.objects['esqueleto']
robot = bpy.data.objects['robot']
P = arm.pose.bones
for b in P:
    b.rotation_mode = 'XYZ'

# --- Cámara y tamaño del cuadro ---
ALTO_PX, METROS_ALTO, METROS_ANCHO = 360, 1.16, 0.84   # el robot mide 1,07 m; sobra lugar para el salto
sc.render.engine = 'BLENDER_EEVEE'
sc.render.resolution_y = ALTO_PX
sc.render.resolution_x = round(ALTO_PX * METROS_ANCHO / METROS_ALTO)
sc.render.film_transparent = True
sc.render.image_settings.file_format = 'PNG'
sc.render.image_settings.color_mode = 'RGBA'
sc.view_settings.view_transform = 'Standard'
cam_d = bpy.data.cameras.new('cam'); cam_d.type = 'ORTHO'; cam_d.ortho_scale = METROS_ALTO
cam = bpy.data.objects.new('cam', cam_d); sc.collection.objects.link(cam); sc.camera = cam
ANGULO = R(-55)  # 0 = de frente, -90 = de perfil mirando a la derecha
cam.location = (6 * math.sin(ANGULO), -6 * math.cos(ANGULO), METROS_ALTO / 2 - 0.03)
cam.rotation_euler = (R(90), 0, ANGULO)
sol_d = bpy.data.lights.new('sol', 'SUN'); sol_d.energy = 3.0; sol_d.angle = R(5)
sol = bpy.data.objects.new('sol', sol_d); sc.collection.objects.link(sol)
sol.rotation_euler = (R(50), 0, R(-30))

def srgb(h):
    c = [int(h[i:i + 2], 16) / 255 for i in (1, 3, 5)]
    return tuple(x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c)

# --- Estilo caricatura ---
SOMBRA = (0.80, 0.78, 0.92, 1)   # la sombra lavanda de la ficha

def caricatura(m, color=None):
    """Cambia el material por uno de 2 tonos: el color de base (textura o fijo) y ese color por la sombra
    lavanda donde no le da la luz. Emite su propio color, así ninguna luz extra lo ensucia.
    Devuelve el nodo del color fijo (si lo hay) para poder cambiarlo por cuadro."""
    m.use_nodes = True
    N, L = m.node_tree.nodes, m.node_tree.links
    salida_m = next(n for n in N if n.type == 'OUTPUT_MATERIAL')
    textura = next((n for n in N if n.type == 'TEX_IMAGE' and n.image and 'color' in n.image.name), None)
    nodo_color = None
    if textura:
        base = textura.outputs['Color']
    else:
        nodo_color = N.new('ShaderNodeRGB'); nodo_color.outputs[0].default_value = (*color, 1)
        base = nodo_color.outputs[0]
    luz = N.new('ShaderNodeBsdfDiffuse'); L.new(base, luz.inputs['Color'])
    a_rgb = N.new('ShaderNodeShaderToRGB'); L.new(luz.outputs[0], a_rgb.inputs[0])
    rampa = N.new('ShaderNodeValToRGB'); rampa.color_ramp.interpolation = 'CONSTANT'
    rampa.color_ramp.elements[0].color = SOMBRA
    rampa.color_ramp.elements[1].position = 0.30; rampa.color_ramp.elements[1].color = (1, 1, 1, 1)
    gris = N.new('ShaderNodeRGBToBW'); L.new(a_rgb.outputs[0], gris.inputs[0]); L.new(gris.outputs[0], rampa.inputs[0])
    mezcla = N.new('ShaderNodeMix'); mezcla.data_type = 'RGBA'; mezcla.blend_type = 'MULTIPLY'
    mezcla.inputs['Factor'].default_value = 1
    L.new(base, mezcla.inputs[6]); L.new(rampa.outputs[0], mezcla.inputs[7])
    brillo = N.new('ShaderNodeEmission'); L.new(mezcla.outputs[2], brillo.inputs['Color'])
    L.new(brillo.outputs[0], salida_m.inputs['Surface'])
    return nodo_color

def emisor(nombre, color, alfa=False):
    """Material que solo emite su color (fuego, chispas, humo). Con alfa, devuelve el nodo de mezcla para el fundido."""
    m = bpy.data.materials.new(nombre); m.use_nodes = True
    N, L = m.node_tree.nodes, m.node_tree.links; N.clear()
    e = N.new('ShaderNodeEmission'); e.inputs['Color'].default_value = (*color, 1)
    o = N.new('ShaderNodeOutputMaterial')
    if not alfa:
        L.new(e.outputs[0], o.inputs[0]); return m, None
    t = N.new('ShaderNodeBsdfTransparent'); mx = N.new('ShaderNodeMixShader')
    L.new(t.outputs[0], mx.inputs[1]); L.new(e.outputs[0], mx.inputs[2]); L.new(mx.outputs[0], o.inputs[0])
    return m, mx

CONTORNO = emisor('contorno', srgb('#1b1a33'))[0]
CONTORNO.use_backface_culling = True

def con_contorno(o, grosor):
    """Contorno: una copia apenas más gruesa, dada vuelta y de color azul marino (se ve solo en el borde)."""
    o.data.materials.append(CONTORNO)
    mod = o.modifiers.new('contorno', 'SOLIDIFY')
    mod.thickness = grosor; mod.offset = 1; mod.use_flip_normals = True; mod.use_rim = False
    mod.material_offset = len(o.data.materials) - 1   # los índices de más se recortan al último: el contorno

caricatura(bpy.data.materials['robot'])

# --- Accesorios ---
def cubo(nombre, tam, mat):
    bpy.ops.mesh.primitive_cube_add(size=1)
    o = bpy.context.object; o.name = nombre
    o.scale = tam
    bpy.ops.object.transform_apply(scale=True)
    bev = o.modifiers.new('borde', 'BEVEL'); bev.width = 0.006; bev.segments = 2
    o.data.materials.append(mat)
    return o

CARTON, QUEMADO = srgb('#c99a62'), srgb('#2a211c')
mat_carton = bpy.data.materials.new('carton'); color_carton = caricatura(mat_carton, CARTON)
mat_cinta = bpy.data.materials.new('cinta'); color_cinta = caricatura(mat_cinta, srgb('#e2c193'))
# el ancho se ajusta en cada cuadro al hueco entre los puños; es baja para no chocar con la cabeza
caja = cubo('caja', (0.15, 0.12, 0.11), mat_carton)
cinta = cubo('cinta', (0.03, 0.122, 0.112), mat_cinta)
cinta.parent = caja
con_contorno(robot, 0.005); con_contorno(caja, 0.004); con_contorno(cinta, 0.003)
ANCHO_CAJA, ALTO_CAJA = 0.15, 0.11

def quemar_caja(nivel):
    """0 = cartón sano, 1 = carbón."""
    mezcla = lambda a, b: tuple(x + (y - x) * nivel for x, y in zip(a, b))
    color_carton.outputs[0].default_value = (*mezcla(CARTON, QUEMADO), 1)
    color_cinta.outputs[0].default_value = (*mezcla(srgb('#e2c193'), QUEMADO), 1)

def esfera(nombre, mat, radio=1.0):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=12, ring_count=8, radius=radio)
    o = bpy.context.object; o.name = nombre; o.data.materials.append(mat)
    bpy.ops.object.shade_smooth()
    return o

azar = random.Random(7)
FUEGO_AFUERA, _ = emisor('fuego', srgb('#ff7a1a'))
FUEGO_ADENTRO, _ = emisor('fuego-centro', srgb('#ffd34d'))
LLAMAS = []   # (llama de afuera, llama de adentro, x, y en la tapa de la caja, fase, tamaño)
for i in range(7):
    LLAMAS.append((esfera(f'llama-{i}', FUEGO_AFUERA), esfera(f'llama-centro-{i}', FUEGO_ADENTRO),
                   azar.uniform(-0.055, 0.055), azar.uniform(-0.04, 0.04), azar.uniform(0, 6.3), azar.uniform(0.8, 1.2)))

def chispa(nombre, mat):
    partes = []
    for giro in (0, 90):
        bpy.ops.mesh.primitive_cube_add(size=1)
        o = bpy.context.object; o.scale = (0.045, 0.006, 0.006); o.rotation_euler = (0, R(giro), 0)
        bpy.ops.object.transform_apply(scale=True, rotation=True); partes.append(o)
    bpy.ops.object.select_all(action='DESELECT')
    for o in partes: o.select_set(True)
    bpy.context.view_layer.objects.active = partes[0]; bpy.ops.object.join()
    o = bpy.context.object; o.name = nombre; o.data.materials.append(mat)
    return o

CHISPAS = [chispa(f'chispa-{i}', emisor(f'chispa-{i}', srgb('#fff36b' if i % 2 else '#7fe3ff'))[0]) for i in range(10)]

CENIZA = bpy.data.materials.new('ceniza'); caricatura(CENIZA, srgb('#55525a'))
BRASA, _ = emisor('brasa', srgb('#ff8a2a'))
CENIZAS = []  # (objeto, posición en la caja 0-1 (x, y, z), deriva x, deriva y, demora, tamaño)
for i in range(46):
    tam = azar.uniform(0.010, 0.022)
    o = cubo(f'ceniza-{i}', (tam, tam, tam * 0.7), BRASA if i % 6 == 0 else CENIZA)
    o.modifiers.clear()
    CENIZAS.append((o, (azar.random(), azar.random(), azar.random()), azar.uniform(-0.25, 0.25),
                    azar.uniform(-0.15, 0.15), azar.uniform(0, 5), azar.uniform(0, 360)))

HUMO = []
for i in range(4):
    mat, mezcla_humo = emisor(f'humo-{i}', srgb('#a9a8b3'), alfa=True)
    HUMO.append((esfera(f'humo-{i}', mat), mezcla_humo))

VAPOR = []   # el vapor del enojo sale de las orejas: blanco y rápido
for i in range(6):
    mat, mezcla_vapor = emisor(f'vapor-{i}', srgb('#c3c8dc'), alfa=True)   # gris azulado: el blanco se pierde en el modo claro
    VAPOR.append((esfera(f'vapor-{i}', mat), mezcla_vapor))

# La flauta dulce de madera: un tubo con anillos oscuros; mide 32 cm.
def tubo(nombre, radio, largo, mat):
    bpy.ops.mesh.primitive_cylinder_add(vertices=16, radius=radio, depth=largo, rotation=(0, R(90), 0))
    o = bpy.context.object; o.name = nombre
    bpy.ops.object.transform_apply(rotation=True)   # el largo queda sobre el eje X
    o.data.materials.append(mat); bpy.ops.object.shade_smooth()
    return o
mat_bambu = bpy.data.materials.new('bambu'); caricatura(mat_bambu, srgb('#e3c08a'))
mat_anillo = bpy.data.materials.new('anillo'); caricatura(mat_anillo, srgb('#5a3e22'))
LARGO_FLAUTA = 0.32
flauta_obj = tubo('flauta', 0.011, LARGO_FLAUTA, mat_bambu)
for i, px_ in enumerate((-0.15, -0.06, 0.05, 0.15)):
    anillo = tubo(f'anillo-{i}', 0.0125, 0.008, mat_anillo); anillo.parent = flauta_obj; anillo.location = (px_, 0, 0)
con_contorno(flauta_obj, 0.003)

EFECTOS = [h[0] for h in VAPOR] + [caja, cinta, flauta_obj, *flauta_obj.children] + [o for l in LLAMAS for o in l[:2]] + CHISPAS + [c[0] for c in CENIZAS] + [h[0] for h in HUMO]

# --- Ayudas de pose ---
def reposo():
    arm.location = (0, 0, 0)
    for b in P:
        b.rotation_euler = (0, 0, 0)
    for o in EFECTOS:
        o.hide_render = True
    quemar_caja(0)

def rot(hueso, x=0, y=0, z=0):
    P[hueso].rotation_euler = (R(x), R(y), R(z))

def sumar(hueso, x=0, y=0, z=0):
    e = P[hueso].rotation_euler
    P[hueso].rotation_euler = (e.x + R(x), e.y + R(y), e.z + R(z))

def giro_de(hueso):
    bpy.context.view_layer.update()
    return (arm.matrix_world @ P[hueso].matrix).to_quaternion()

def suave(t):
    """Arranca y frena despacio (0 → 1)."""
    t = min(1.0, max(0.0, t))
    return t * t * (3 - 2 * t)

def tramo(f, desde, hasta):
    return suave((f - desde) / (hasta - desde))

def vertices_de(*huesos):
    indices = {robot.vertex_groups[h].index for h in huesos}
    return [v.index for v in robot.data.vertices if any(g.group in indices and g.weight > 0.5 for g in v.groups)]
MANO_IZQ, MANO_DER = vertices_de('LeftHand'), vertices_de('RightHand')

# --- Caras de la pantalla ---
# La cara sonriente viene en el modelo (pintada y en relieve). Las otras se muestran como pantalla
# encendida (material que emite luz, así no se ve el relieve de la sonrisa) con una imagen de dibujar-caras.py,
# proyectada de frente con un mapa UV propio ("cara") calculado en reposo: sigue a la cabeza cuando gira.
PANTALLA_X, PANTALLA_Z = (-0.14, 0.14), (0.665, 0.865)
def caras_de_pantalla():
    import numpy as np
    malla = robot.data
    grupo = robot.vertex_groups['Pantalla'].index
    en_grupo = {v.index for v in malla.vertices if any(g.group == grupo for g in v.groups)}
    color = bpy.data.images['robot_color']
    px = np.empty(len(color.pixels), np.float32); color.pixels.foreach_get(px)
    px = px.reshape(color.size[1], color.size[0], 4)
    uv_original = malla.uv_layers.active.data
    caras = []
    for f in malla.polygons:
        if not all(i in en_grupo for i in f.vertices):
            continue
        u = sum(uv_original[l].uv.x for l in f.loop_indices) / f.loop_total
        v = sum(uv_original[l].uv.y for l in f.loop_indices) / f.loop_total
        r, g, b, _ = px[min(int(v * color.size[1]), color.size[1] - 1), min(int(u * color.size[0]), color.size[0] - 1)]
        c = f.center
        # toda la pantalla hasta el borde blanco, sin la visera azul; así no queda un borde serruchado
        claro = 0.3 * r + 0.6 * g + 0.1 * b > 0.5
        azul = b > r + 0.15
        centro = abs(c.x) < 0.11 and 0.69 < c.z < 0.83   # adentro de la pantalla (ahí están los trazos blancos)
        if centro or not (claro or azul):
            caras.append(f.index)
    activo, render = malla.uv_layers.active_index, next(i for i, l in enumerate(malla.uv_layers) if l.active_render)
    uv_cara = malla.uv_layers.new(name='cara')
    for f in malla.polygons:
        for l in f.loop_indices:
            co = malla.vertices[malla.loops[l].vertex_index].co
            uv_cara.data[l].uv = ((co.x - PANTALLA_X[0]) / (PANTALLA_X[1] - PANTALLA_X[0]),
                                  (co.z - PANTALLA_Z[0]) / (PANTALLA_Z[1] - PANTALLA_Z[0]))
    malla.uv_layers.active_index = activo
    malla.uv_layers[render].active_render = True
    return caras

CARAS_PANTALLA = caras_de_pantalla()
MATERIAL_PANTALLA = bpy.data.materials.new('pantalla'); MATERIAL_PANTALLA.use_nodes = True
_N, _L = MATERIAL_PANTALLA.node_tree.nodes, MATERIAL_PANTALLA.node_tree.links; _N.clear()
_uv = _N.new('ShaderNodeUVMap'); _uv.uv_map = 'cara'
IMAGEN_CARA = _N.new('ShaderNodeTexImage'); IMAGEN_CARA.extension = 'EXTEND'
_e = _N.new('ShaderNodeEmission'); _o = _N.new('ShaderNodeOutputMaterial')
_L.new(_uv.outputs['UV'], IMAGEN_CARA.inputs['Vector']); _L.new(IMAGEN_CARA.outputs['Color'], _e.inputs['Color'])
_L.new(_e.outputs[0], _o.inputs[0])
# el contorno va último: la pantalla entra antes que él
robot.data.materials.append(MATERIAL_PANTALLA)
robot.data.materials[len(robot.data.materials) - 2], robot.data.materials[len(robot.data.materials) - 1] = MATERIAL_PANTALLA, CONTORNO
INDICE_PANTALLA = len(robot.data.materials) - 2
robot.modifiers['contorno'].material_offset = len(robot.data.materials) - 1
IMAGENES_CARA = {}

def cara(nombre='sonriente'):
    if nombre == 'sonriente':
        indice = 0
    else:
        if nombre not in IMAGENES_CARA:
            IMAGENES_CARA[nombre] = bpy.data.images.load(bpy.path.abspath(f'//../caras/{nombre}.png'))
        IMAGEN_CARA.image = IMAGENES_CARA[nombre]
        indice = INDICE_PANTALLA
    for i in CARAS_PANTALLA:
        robot.data.polygons[i].material_index = indice
    robot.data.update()

# --- La caja en las manos ---
def caja_en_manos(alto=1.0):
    """La caja va apretada entre los dos puños: cada costado toca una mano y queda girada como el pecho.
    Se mide dónde quedaron las manos en este cuadro (con la pose ya aplicada), así nunca las atraviesa.
    `alto` < 1 la achata desde arriba (cuando se desmorona)."""
    bpy.context.view_layer.update()
    evaluado = robot.evaluated_get(bpy.context.evaluated_depsgraph_get())
    malla = evaluado.to_mesh()
    # cuánto giró el pecho respecto de su reposo (el hueso apunta por su eje Y: no sirven sus ejes directos)
    reposo_pecho = arm.data.bones['Spine1'].matrix_local.to_quaternion()
    giro = (giro_de('Spine1') @ reposo_pecho.inverted()).to_matrix().to_4x4()
    a_pecho = giro.inverted()  # ejes del pecho: x a los costados, y hacia atrás, z hacia arriba
    izq = [a_pecho @ (robot.matrix_world @ malla.vertices[i].co) for i in MANO_IZQ]
    der = [a_pecho @ (robot.matrix_world @ malla.vertices[i].co) for i in MANO_DER]
    evaluado.to_mesh_clear()
    borde_izq, borde_der = min(p.x for p in izq), max(p.x for p in der)   # las caras de adentro de los puños
    medio = lambda ps, c: (min(getattr(p, c) for p in ps) + max(getattr(p, c) for p in ps)) / 2
    centro = Vector(((borde_izq + borde_der) / 2,
                     (medio(izq, 'y') + medio(der, 'y')) / 2,
                     (medio(izq, 'z') + medio(der, 'z')) / 2 - (1 - alto) * ALTO_CAJA / 2))
    ancho = (borde_izq - borde_der) + 0.004   # apenas más ancha: que se vea apretada, sin hueco
    caja.matrix_world = giro @ Matrix.Translation(centro) @ Matrix.Diagonal((ancho / ANCHO_CAJA, 1, max(alto, 0.001), 1))
    caja.hide_render = cinta.hide_render = alto < 0.03

# --- Partes de pose que se repiten ---
def caida_de_cadera(angulo_muslo):
    """Cuánto baja el cuerpo cuando la pierna de apoyo está inclinada (así el pie no se hunde en el piso)."""
    return -0.265 * (1 - math.cos(R(abs(angulo_muslo))))

def piernas_caminando(t, paso=28):
    f = 2 * math.pi * t
    for lado, fase in (('Left', 0), ('Right', math.pi)):
        muslo = -paso * math.sin(f + fase)                 # negativo = adelante
        rodilla = 50 * max(0.0, math.cos(f + fase)) ** 1.5  # dobla mientras la pierna va por el aire
        rot(f'{lado}UpLeg', muslo)
        rot(f'{lado}Leg', rodilla)
        rot(f'{lado}Foot', -(muslo + rodilla) * 0.6)        # la suela casi paralela al piso
        rot(f'{lado}ToeBase', 25 * max(0.0, math.sin(f + fase)))  # despega la punta al empujar
    apoyo = paso * abs(math.sin(f))
    arm.location = (0, 0, caida_de_cadera(apoyo) * 0.85 + 0.008 * math.cos(2 * f))
    rot('Spine1', 3, 0, 4 * math.sin(f))                    # el pecho gira un poco contra las piernas
    rot('Neck', 2 * math.cos(2 * f - 0.5))                  # la cabeza llega un poquito tarde
    rot('Head', 0, 2 * math.sin(f - 0.6), 0)
    rot('LeftEar', 8 * math.sin(2 * f - 1.0))               # las orejas, todavía más tarde
    rot('RightEar', 8 * math.sin(2 * f - 1.2))

def brazos_sueltos(t, balanceo=24):
    f = 2 * math.pi * t
    for lado, fase, s in (('Left', math.pi, 1), ('Right', 0, -1)):
        rot(f'{lado}Arm', -balanceo * math.sin(f + fase), 0, -s * 6)   # Z negativo (izquierda) = abre hacia afuera
        rot(f'{lado}ForeArm', -18 - 10 * max(0.0, -math.sin(f + fase - 0.4)))

def brazos_con_caja(rebote=0.0):
    """Carga apretando la caja entre los puños, con los antebrazos hacia adelante."""
    for lado, s in (('Left', 1), ('Right', -1)):
        rot(f'{lado}Arm', -5 + rebote, 0, -s * 4)
        rot(f'{lado}ForeArm', -82 - rebote)          # antebrazo casi horizontal, a la altura de la panza
        rot(f'{lado}Hand', -5)
        rot(f'{lado}ShoulderPad', -4)

def brazos_abajo():
    rot('LeftArm', 0, 0, -5); rot('RightArm', 0, 0, 5)
    rot('LeftForeArm', -12); rot('RightForeArm', -12)

def mezclar_brazos(con_caja, t):
    """Pasa suave de los brazos con caja (t=0) a los brazos abajo (t=1)."""
    valores = {}
    brazos_con_caja(); valores['caja'] = {b.name: tuple(b.rotation_euler) for b in P}
    for b in P:
        if any(k in b.name for k in ('Arm', 'Hand', 'ShoulderPad')):
            b.rotation_euler = (0, 0, 0)
    brazos_abajo(); valores['abajo'] = {b.name: tuple(b.rotation_euler) for b in P}
    for b in P:
        if any(k in b.name for k in ('Arm', 'Hand', 'ShoulderPad')):
            a, z = valores['caja'][b.name], valores['abajo'][b.name]
            b.rotation_euler = tuple(x + (y - x) * t for x, y in zip(a, z))

# --- Animaciones ---
def respirar(f, n):
    """Quieto en la esquina, sin caja: respira, mueve las orejas y mira apenas a los costados."""
    t = 2 * math.pi * f / n
    brazos_abajo()
    arm.location = (0, 0, 0.004 * math.sin(t))
    rot('Spine1', 1.5 * math.sin(t)); sumar('LeftArm', 2 * math.sin(t)); sumar('RightArm', 2 * math.sin(t))
    rot('Neck', 1.5 * math.sin(t - 0.5)); rot('Head', 0, 3 * math.sin(t / 2), 4 * math.sin(t / 2))
    rot('LeftEar', 6 * math.sin(t - 1)); rot('RightEar', 6 * math.sin(t - 1.3))

def recoger(f, n):
    """Se agacha, toma la caja del piso y se levanta con ella."""
    bajar = math.sin(math.pi * f / (n - 1))           # 0 → 1 → 0
    tiene = f >= n // 2
    agache = 0.07 * bajar
    arm.location = (0, 0, -agache)
    for lado in ('Left', 'Right'):
        rot(f'{lado}UpLeg', -35 * bajar); rot(f'{lado}Leg', 60 * bajar); rot(f'{lado}Foot', -25 * bajar)
    rot('Spine1', 22 * bajar); rot('Neck', 10 * bajar)
    if tiene:
        brazos_con_caja(rebote=-20 * bajar)
        caja_en_manos()
    else:
        mezclar_brazos(True, 1 - bajar)
    rot('LeftEar', -10 * bajar); rot('RightEar', -10 * bajar)

def caminar(f, n):
    piernas_caminando(f / n); brazos_sueltos(f / n)

def caminar_caja(f, n):
    t = f / n
    piernas_caminando(t, paso=24); brazos_con_caja(rebote=3 * math.sin(4 * math.pi * t - 0.8))
    sumar('Spine1', -4, 0, -2)   # se echa un poco atrás por el peso
    caja_en_manos()

FASES_PENSAR = ['engranaje-0', 'engranaje-1', 'engranaje-2'] * 2 + ['carga-1', 'carga-1', 'carga-2', 'carga-2', 'carga-3', 'carga-3'] \
    + ['pregunta'] * 6 + ['binario-a', 'binario-a', 'binario-b', 'binario-b', 'binario-a', 'binario-b']

def pensar(f, n):
    """Sostiene la caja y piensa: la cabeza se ladea de un lado al otro y la pantalla muestra símbolos."""
    t = 2 * math.pi * f / n
    brazos_con_caja()
    arm.location = (0, 0, 0.004 * math.sin(2 * t))
    rot('Spine1', 2 + 1.5 * math.sin(2 * t)); rot('Neck', 4)
    rot('Head', 3 * math.sin(2 * t), 10 * math.sin(t), 6 * math.sin(t - 0.4))
    rot('LeftEar', 10 * math.sin(2 * t)); rot('RightEar', -10 * math.sin(2 * t))   # orejas como antenas buscando señal
    cara(FASES_PENSAR[f % len(FASES_PENSAR)])
    caja_en_manos()

def entregar(f, n):
    """Llegó al buzón: estira los brazos y suelta la caja hacia adelante."""
    t = tramo(f, 0, n - 2)
    brazos_con_caja()
    for lado in ('Left', 'Right'):
        sumar(f'{lado}Arm', -35 * t); sumar(f'{lado}ForeArm', 25 * t)
    rot('Spine1', 10 * t); rot('Neck', 4 * t)
    if f < n - 2:
        caja_en_manos()

def salto():
    """Entregó la caja: festeja con los brazos abiertos (el salto en sí lo hace la app)."""
    for lado, s in (('Left', 1), ('Right', -1)):
        rot(f'{lado}Arm', -15, 0, -s * 115); rot(f'{lado}ForeArm', -20)   # brazos abiertos en V (arriba la cabeza los tapa)
        rot(f'{lado}ShoulderPad', 0, 0, -s * 20)
    rot('LeftUpLeg', -25); rot('LeftLeg', 45); rot('RightUpLeg', 10); rot('RightLeg', 30)
    rot('LeftEar', -15); rot('RightEar', -15); rot('Head', -8)

def humo(f, desde=0, intensidad=1.0):
    """Bocanadas que salen de la cabeza, suben, crecen y se desvanecen."""
    bpy.context.view_layer.update()
    tope = arm.matrix_world @ P['Head'].tail + Vector((0, 0.06, 0.10))   # sube poco: arriba se corta el cuadro
    for i, (o, mezcla_humo) in enumerate(HUMO):
        p = ((f - desde) / 10 + i / len(HUMO)) % 1
        if f < desde:
            continue
        o.hide_render = False
        o.location = tope + Vector((0.03 * math.sin(6 * p + i), 0.04 * p, 0.10 * p))
        o.scale = [0.022 + 0.04 * p] * 3
        mezcla_humo.inputs[0].default_value = 0.85 * (1 - p) * intensidad

def preocupado(f, n):
    """Sin caja (se quemó): orejas caídas, cabeza ladeada y un hilito de humo."""
    t = 2 * math.pi * f / n
    brazos_abajo()
    rot('Spine1', 4); rot('Neck', 6); rot('Head', 4, 12 + 2 * math.sin(t), 0)   # ladea la cabeza sin darle la espalda a la cámara
    rot('LeftEar', -30 + 3 * math.sin(t)); rot('RightEar', -30 + 3 * math.sin(t))
    cara('preocupado')
    humo(f, intensidad=0.6)

def cortocircuito(f, n):
    """Se bloqueó: chispas y estática, la caja se prende fuego, se desmorona en cenizas y queda humeando."""
    azar_f = random.Random(f)
    sacudon = 1 - tramo(f, 14, 24)
    # brazos: con la caja hasta que se desmorona, después bajan
    brazos_con_caja()
    if f >= 22:
        mezclar_brazos(True, tramo(f, 22, 31))
    # sacudón: cada cuadro, un temblor distinto
    for hueso, fuerza in (('Spine1', 5), ('Neck', 6), ('Head', 8), ('LeftArm', 7), ('RightArm', 7), ('LeftEar', 18), ('RightEar', 18)):
        sumar(hueso, *(azar_f.uniform(-fuerza, fuerza) * sacudon for _ in range(3)))
    arm.location = (azar_f.uniform(-0.01, 0.01) * sacudon, 0, azar_f.uniform(0, 0.012) * sacudon)
    rot('LeftEar', -30 * tramo(f, 24, 32) + 18 * sacudon * azar_f.uniform(-1, 1))
    rot('RightEar', -30 * tramo(f, 24, 32) + 18 * sacudon * azar_f.uniform(-1, 1))
    # pantalla: estática → mareado → preocupado
    cara(f'estatica-{f % 3}' if f < 12 else 'espiral' if f < 26 else 'preocupado')
    # caja: se quema (8 → 20) y se desmorona (20 → 27)
    quemar_caja(tramo(f, 8, 20))
    alto = 1 - tramo(f, 20, 27)
    if f < 22:
        caja_en_manos(alto)
    else:   # la caja ya no sigue a las manos: se queda donde estaba y se achata
        brazos = {b.name: tuple(b.rotation_euler) for b in P}
        brazos_con_caja(); caja_en_manos(alto)
        for b in P: b.rotation_euler = brazos[b.name]
    bpy.context.view_layer.update()
    m_caja = caja.matrix_world.copy()
    # fuego en la tapa: crece, titila y se apaga cuando la caja se deshace
    fuego = tramo(f, 6, 12) * (1 - tramo(f, 21, 26))
    for afuera, adentro, lx, ly, fase, tam in LLAMAS:
        if fuego <= 0.01:
            continue
        titila = 0.75 + 0.25 * math.sin(f * 1.9 + fase) + 0.15 * math.sin(f * 3.7 + 2 * fase)
        base = m_caja @ Vector((lx, ly, ALTO_CAJA / 2))
        alto_llama = 0.08 * tam * titila * fuego
        afuera.hide_render = adentro.hide_render = False
        afuera.location = base + Vector((0, 0, alto_llama * 0.8))
        afuera.scale = (0.032 * tam * fuego, 0.032 * tam * fuego, alto_llama)
        afuera.rotation_euler = (0, R(8 * math.sin(f + fase)), 0)
        adentro.location = base + Vector((0, -0.012, alto_llama * 0.5))
        adentro.scale = (0.018 * tam * fuego, 0.018 * tam * fuego, alto_llama * 0.55)
    # cenizas: nacen dentro de la caja y caen al piso; al final se achican hasta desaparecer
    if f >= 20:
        medidas = Vector((ANCHO_CAJA, 0.12, ALTO_CAJA))
        for o, (px_, py_, pz_), dx, dy, demora, giro in CENIZAS:
            arranque = 20 + demora * (1 - pz_)          # las de abajo caen primero
            if f < arranque - 1 or pz_ > alto + 0.15:
                continue
            origen = m_caja @ Vector(((px_ - 0.5) * medidas.x, (py_ - 0.5) * medidas.y, (pz_ - 0.5) * ALTO_CAJA))
            s = max(0.0, (f - arranque) / 12)             # segundos desde que empezó a caer (12 cuadros por segundo)
            z = max(o.dimensions.z / 2, origen.z - 4.9 * s * s)
            o.hide_render = False
            o.location = (origen.x + dx * s, origen.y + dy * s, z)
            o.rotation_euler = (R(giro + 200 * s), R(giro * 0.5 + 150 * s), 0)
            o.scale = [1 - tramo(f, 29, n - 1)] * 3
    # chispas: los primeros cuadros, alrededor de la cabeza y los hombros
    if f < 16:
        cabeza = arm.matrix_world @ P['Head'].head
        for c in CHISPAS:
            if azar_f.random() < 0.55 * sacudon:
                c.hide_render = False
                c.location = cabeza + Vector((azar_f.uniform(-0.25, 0.25), azar_f.uniform(-0.15, 0.1), azar_f.uniform(-0.15, 0.3)))
                c.rotation_euler = (azar_f.uniform(0, 3), azar_f.uniform(0, 3), azar_f.uniform(0, 3))
                c.scale = [azar_f.uniform(1.2, 2.2)] * 3
    if f >= 26:
        humo(f, desde=26)

def golpe(f, n, con_caja):
    """Le pegaron con una caja de frente: se echa atrás y rebota como un resorte que se amortigua."""
    s = f / 14                                   # segundos (la app lo pasa a 14 cuadros por segundo)
    resorte = 1.4 * math.exp(-4.5 * s) * math.sin(11 * s + 0.3)   # arranca casi quieto y llega al máximo en ~2 cuadros
    empujon = 1 - math.exp(-7 * s)               # cuánto retrocedió (rápido al principio, después se queda)
    salto_atras = math.sin(math.pi * min(1.0, s / 0.35))
    arm.location = (0, 0.035 * empujon, 0.018 * max(0.0, salto_atras))
    rot('Spine1', -10 * resorte); rot('Neck', -6 * resorte); rot('Head', -9 * resorte, 6 * resorte, 0)
    rot('RightUpLeg', 22 * salto_atras); rot('RightLeg', 30 * salto_atras); rot('RightFoot', -10 * salto_atras)
    rot('LeftLeg', 12 * salto_atras)
    if con_caja:
        brazos_con_caja(rebote=8 * resorte)
    else:
        for lado, lado_s in (('Left', 1), ('Right', -1)):
            rot(f'{lado}Arm', -25 * abs(resorte), 0, -lado_s * 55 * abs(resorte)); rot(f'{lado}ForeArm', -30 * abs(resorte))
    rot('LeftEar', 35 * resorte); rot('RightEar', 30 * resorte)
    cara('golpe' if f < n * 0.7 else 'sonriente')
    if con_caja:
        caja_en_manos()

def vapor(f):
    """Bocanadas de vapor que salen disparadas de los dos auriculares, hacia arriba y afuera."""
    bpy.context.view_layer.update()
    cabeza = arm.matrix_world @ P['Head'].head
    for i, (o, mezcla_vapor) in enumerate(VAPOR):
        lado = 1 if i % 2 else -1
        p = (f / 6 + i / len(VAPOR)) % 1
        oreja = cabeza + Vector((lado * 0.24, 0.02, 0.17))
        o.hide_render = False
        o.location = oreja + Vector((lado * 0.08 * p, 0, 0.12 * p))
        o.scale = [0.022 + 0.045 * p] * 3
        mezcla_vapor.inputs[0].default_value = 1.0 - 0.7 * p ** 2

def molesto(f, n, con_caja):
    """Le desordenaron las cajas mientras ordenaba: dos pisotones, cabeza que dice "no" y vapor por las orejas."""
    t = f / n
    levanta = max(0.0, math.sin(2 * math.pi * 2 * t))           # dos pisotones
    golpe_piso = max(0.0, -math.sin(2 * math.pi * 2 * t)) ** 3   # el instante en que el pie pega en el piso
    arm.location = (0, 0, 0.012 * levanta - 0.006 * golpe_piso)
    rot('RightUpLeg', -28 * levanta); rot('RightLeg', 45 * levanta); rot('RightFoot', -15 * levanta)
    rot('LeftLeg', 6 * levanta)
    rot('Spine1', 5 + 3 * golpe_piso); rot('Neck', 4)
    rot('Head', 4, 0, 14 * math.sin(2 * math.pi * 3 * t))      # "no, no, no"
    if con_caja:
        brazos_con_caja(rebote=4 * golpe_piso)
    else:
        for lado, lado_s in (('Left', 1), ('Right', -1)):   # brazos tiesos, un poco para atrás, puños apretados
            rot(f'{lado}Arm', 15 + 4 * golpe_piso, 0, -lado_s * 12); rot(f'{lado}ForeArm', -20)
    rot('LeftEar', -28 + 6 * math.sin(2 * math.pi * 6 * t)); rot('RightEar', -28 + 6 * math.sin(2 * math.pi * 6 * t + 1))
    cara('molesto')
    vapor(f)
    if con_caja:
        caja_en_manos()

def brazos_flauta(t=0.0):
    """Los dos brazos arriba, las manos juntas delante de la boca; los dedos "tocan" alternados."""
    for lado, s_ in (('Left', 1), ('Right', -1)):
        rot(f'{lado}Arm', -70, 0, s_ * 24)
        rot(f'{lado}ForeArm', -35)
        rot(f'{lado}ShoulderPad', -10)
    rot('LeftHand', 6 * max(0.0, math.sin(4 * t)), 0, 0)
    rot('RightHand', 6 * max(0.0, math.sin(4 * t + math.pi)), 0, 0)

BOCA = Vector((0, -0.205, 0.735))   # la boca en la pantalla, en reposo

def flauta_en_manos():
    """Flauta dulce: arriba en la boca (sigue a la cabeza) y hacia abajo y adelante, pasando por las manos.
    Así se lee de costado; una flauta horizontal, desde la cámara en 3/4, quedaba escondida entre las manos."""
    bpy.context.view_layer.update()
    giro_cabeza = arm.matrix_world @ P['Head'].matrix @ arm.data.bones['Head'].matrix_local.inverted()
    boca = giro_cabeza @ BOCA
    manos = (arm.matrix_world @ P['LeftHand'].tail + arm.matrix_world @ P['RightHand'].tail) / 2
    direccion = (manos - boca).normalized()
    centro = boca + direccion * (LARGO_FLAUTA / 2 - 0.01)
    giro = Vector((1, 0, 0)).rotation_difference(direccion).to_matrix().to_4x4()
    flauta_obj.matrix_world = Matrix.Translation(centro) @ giro
    for o in (flauta_obj, *flauta_obj.children):
        o.hide_render = False

def mezclar_poses(desde, hasta, t):
    """Pasa suave de una pose de brazos a otra (cada una es una función que la arma)."""
    poses = []
    for armar in (desde, hasta):
        for b in P:
            if any(k in b.name for k in ('Arm', 'Hand', 'ShoulderPad')):
                b.rotation_euler = (0, 0, 0)
        armar(); poses.append({b.name: tuple(b.rotation_euler) for b in P})
    for b in P:
        if any(k in b.name for k in ('Arm', 'Hand', 'ShoulderPad')):
            a, z = poses[0][b.name], poses[1][b.name]
            b.rotation_euler = tuple(x + (y - x) * t for x, y in zip(a, z))

def sacar_flauta(f, n):
    """Saca la flauta de la cintura y la sube hasta la boca (al revés, la guarda)."""
    t = suave(f / (n - 1))
    mezclar_poses(brazos_abajo, brazos_flauta, t)
    rot('Head', -4 * t, 0, 0); rot('LeftEar', 8 * t); rot('RightEar', 8 * t)
    if f >= 2:
        flauta_en_manos()
    if f >= n - 2:
        cara('flauta')

def tocar_flauta(f, n):
    """Toca: se balancea con la melodía, ojos cerrados felices y los dedos que suben y bajan."""
    t = 2 * math.pi * f / n
    brazos_flauta(t)
    arm.location = (0, 0, 0.004 * math.sin(2 * t))
    rot('Spine1', 2 * math.sin(2 * t), 3 * math.sin(t), 4 * math.sin(t))
    rot('Neck', 2 * math.sin(2 * t - 0.4)); rot('Head', -4 + 2 * math.sin(2 * t - 0.6), 6 * math.sin(t - 0.5), 0)
    rot('LeftEar', 8 + 8 * math.sin(t - 1.0)); rot('RightEar', 8 + 8 * math.sin(t - 1.3))
    for lado, fase in (('Left', 0), ('Right', math.pi)):   # marca el ritmo con un pie
        rot(f'{lado}Foot', 0)
    rot('RightToeBase', 12 * max(0.0, math.sin(2 * t)))
    cara('flauta')
    flauta_en_manos()

# --- Lista de cuadros: nombre -> función que arma la pose ---
def serie(nombre, n, funcion):
    return {f'{nombre}-{i}': (lambda i=i: funcion(i, n)) for i in range(n)}

CUADROS = {
    **serie('respirar', 16, respirar),
    **serie('recoger', 8, recoger),
    **serie('caminar', 16, caminar),
    **serie('caja', 16, caminar_caja),
    **serie('pensar', len(FASES_PENSAR), pensar),
    **serie('entregar', 6, entregar),
    'salto': salto,
    **serie('corto', 36, cortocircuito),
    **serie('preocupado', 10, preocupado),
    **serie('golpe', 12, lambda f, n: golpe(f, n, False)),
    **serie('golpe-caja', 12, lambda f, n: golpe(f, n, True)),
    **serie('molesto', 16, lambda f, n: molesto(f, n, False)),
    **serie('molesto-caja', 16, lambda f, n: molesto(f, n, True)),
    **serie('sacar-flauta', 8, sacar_flauta),
    **serie('flauta', 16, tocar_flauta),
}

if __name__ == '__main__':
    for nombre, armar in CUADROS.items():
        if solo and nombre not in solo:
            continue
        reposo(); cara()
        armar()
        sc.render.filepath = f'{salida}/{nombre}.png'
        bpy.ops.render.render(write_still=True)
        print('Cuadro', nombre)
