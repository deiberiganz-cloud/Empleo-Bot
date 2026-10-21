# Paso 4: anima al robot y renderiza los cuadros (sprites) que usa la app en el encabezado.
# Cada animación es una función que, para un instante t (0 a 1), pone los huesos en su lugar.
# La cámara mira en 3/4 y el robot camina hacia la derecha (la app lo espeja para ir a la izquierda).
# Uso: blender -b modelo/robot-con-esqueleto.blend -P animar-robot.py -- <carpeta de salida> [nombre ...]
#      (con nombres, renderiza solo esos cuadros; sirve para probar)
import bpy, sys, math
from mathutils import Matrix, Vector

args = sys.argv[sys.argv.index('--') + 1:]
salida, solo = args[0], set(args[1:])
R = math.radians
sc = bpy.context.scene
arm = bpy.data.objects['esqueleto']
P = arm.pose.bones
for b in P:
    b.rotation_mode = 'XYZ'

# --- Cámara, luz y tamaño del cuadro ---
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

mundo = sc.world or bpy.data.worlds.new('mundo'); sc.world = mundo
mundo.use_nodes = True
fondo = mundo.node_tree.nodes['Background']
fondo.inputs['Color'].default_value = (1, 1, 1, 1); fondo.inputs['Strength'].default_value = 0.9
sol_d = bpy.data.lights.new('sol', 'SUN'); sol_d.energy = 2.2; sol_d.angle = R(20)
sol = bpy.data.objects.new('sol', sol_d); sc.collection.objects.link(sol)
sol.rotation_euler = (R(50), 0, R(-30))

# --- Accesorios: la caja (mismos colores que las cajitas de la app) y la tablet ---
def material(nombre, color, rugosidad=0.8):
    m = bpy.data.materials.new(nombre)
    m.use_nodes = True
    bsdf = m.node_tree.nodes['Principled BSDF']
    bsdf.inputs['Base Color'].default_value = (*color, 1)
    bsdf.inputs['Roughness'].default_value = rugosidad
    return m

def srgb(h):
    c = [int(h[i:i + 2], 16) / 255 for i in (1, 3, 5)]
    return tuple(x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c)

def cubo(nombre, tam, mat):
    bpy.ops.mesh.primitive_cube_add(size=1)
    o = bpy.context.object; o.name = nombre
    o.scale = tam
    bpy.ops.object.transform_apply(scale=True)
    bev = o.modifiers.new('borde', 'BEVEL'); bev.width = 0.006; bev.segments = 2
    o.data.materials.append(mat)
    return o

# el ancho se ajusta en cada cuadro al hueco entre los puños; es baja para no chocar con la cabeza
caja = cubo('caja', (0.15, 0.12, 0.11), material('carton', srgb('#c99a62')))
cinta = cubo('cinta', (0.03, 0.122, 0.112), material('cinta', srgb('#e2c193')))
cinta.parent = caja
tablet = cubo('tablet', (0.16, 0.11, 0.012), material('tablet', srgb('#2b2a45'), 0.4))
pantalla = cubo('pantalla-tablet', (0.14, 0.09, 0.002), material('luz', srgb('#9fd3ff'), 0.3))
pantalla.parent = tablet; pantalla.location = (0, 0, 0.007)

# --- Ayudas ---
def reposo():
    arm.location = (0, 0, 0)
    for b in P:
        b.rotation_euler = (0, 0, 0)

def rot(hueso, x=0, y=0, z=0):
    P[hueso].rotation_euler = (R(x), R(y), R(z))

def mundo_de(hueso, punta=True):
    bpy.context.view_layer.update()
    return arm.matrix_world @ (P[hueso].tail if punta else P[hueso].head)

def giro_de(hueso):
    bpy.context.view_layer.update()
    return (arm.matrix_world @ P[hueso].matrix).to_quaternion()

robot = bpy.data.objects['robot']
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

def material_de_cara(nombre):
    m = bpy.data.materials.new(f'cara-{nombre}')
    m.use_nodes = True
    n = m.node_tree.nodes; n.clear()
    uv = n.new('ShaderNodeUVMap'); uv.uv_map = 'cara'
    img = n.new('ShaderNodeTexImage')
    img.image = bpy.data.images.load(bpy.path.abspath(f'//../caras/{nombre}.png'))
    img.extension = 'EXTEND'
    luz = n.new('ShaderNodeEmission'); luz.inputs['Strength'].default_value = 1.0
    salida_m = n.new('ShaderNodeOutputMaterial')
    m.node_tree.links.new(uv.outputs['UV'], img.inputs['Vector'])
    m.node_tree.links.new(img.outputs['Color'], luz.inputs['Color'])
    m.node_tree.links.new(luz.outputs['Emission'], salida_m.inputs['Surface'])
    return m

CARAS_PANTALLA = caras_de_pantalla()
CARAS = {'sonriente': 0}
for nombre in ('preocupado',):
    robot.data.materials.append(material_de_cara(nombre))
    CARAS[nombre] = len(robot.data.materials) - 1

def cara(nombre='sonriente'):
    indice = CARAS[nombre]
    for i in CARAS_PANTALLA:
        robot.data.polygons[i].material_index = indice
    robot.data.update()
ANCHO_CAJA = caja.dimensions.x

def caja_en_manos():
    """La caja va apretada entre los dos puños: cada costado toca una mano y queda girada como el pecho.
    Se mide dónde quedaron las manos en este cuadro (con la pose ya aplicada), así nunca las atraviesa."""
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
                     (medio(izq, 'z') + medio(der, 'z')) / 2))
    ancho = (borde_izq - borde_der) + 0.004   # apenas más ancha: que se vea apretada, sin hueco
    caja.matrix_world = giro @ Matrix.Translation(centro) @ Matrix.Diagonal((ancho / ANCHO_CAJA, 1, 1, 1))
    mostrar(caja)

def esconder(*objetos):
    for o in objetos:
        for parte in (o, *o.children):
            parte.hide_render = True

def mostrar(*objetos):
    for o in objetos:
        for parte in (o, *o.children):
            parte.hide_render = False

def caida_de_cadera(angulo_muslo):
    """Cuánto baja el cuerpo cuando la pierna de apoyo está inclinada (así el pie no se hunde en el piso)."""
    return -0.265 * (1 - math.cos(R(abs(angulo_muslo))))

def piernas_caminando(t, paso=28):
    f = 2 * math.pi * t
    for lado, fase in (('Left', 0), ('Right', math.pi)):
        muslo = -paso * math.sin(f + fase)                 # negativo = adelante
        rodilla = 50 * max(0.0, math.cos(f + fase))         # dobla mientras la pierna va por el aire
        rot(f'{lado}UpLeg', muslo)
        rot(f'{lado}Leg', rodilla)
        rot(f'{lado}Foot', -(muslo + rodilla) * 0.6)        # la suela casi paralela al piso
        rot(f'{lado}ToeBase', 25 * max(0.0, math.sin(f + fase)))  # despega la punta al empujar
    apoyo = paso * abs(math.sin(f))
    arm.location = (0, 0, caida_de_cadera(apoyo) * 0.85)
    rot('Spine1', 3, 0, 4 * math.sin(f))                    # el pecho gira un poco contra las piernas
    rot('Neck', 2 * math.cos(2 * f))
    rot('LeftEar', 7 * math.sin(2 * f + 0.6))               # las orejas se bambolean con retraso
    rot('RightEar', 7 * math.sin(2 * f + 0.6))

def brazos_sueltos(t, balanceo=24):
    f = 2 * math.pi * t
    for lado, fase, s in (('Left', math.pi, 1), ('Right', 0, -1)):
        rot(f'{lado}Arm', -balanceo * math.sin(f + fase), 0, -s * 6)   # Z negativo (izquierda) = abre hacia afuera
        rot(f'{lado}ForeArm', -18 - 8 * max(0.0, -math.sin(f + fase)))

def brazos_con_caja():
    """Carga desde abajo: antebrazos hacia adelante y la caja apoyada encima (los brazos son muy cortos
    para agarrarla por los costados)."""
    for lado, s in (('Left', 1), ('Right', -1)):
        rot(f'{lado}Arm', -5, 0, -s * 4)
        rot(f'{lado}ForeArm', -82)          # antebrazo casi horizontal, a la altura de la panza
        rot(f'{lado}Hand', -5)
        rot(f'{lado}ShoulderPad', -4)

# --- Animaciones: nombre del cuadro -> función que arma la pose ---
def parado():
    reposo(); esconder(caja, tablet)
    rot('LeftArm', 0, 0, -5); rot('RightArm', 0, 0, 5)
    rot('LeftForeArm', -12); rot('RightForeArm', -12)

def parado_caja():
    reposo(); esconder(tablet)
    brazos_con_caja(); caja_en_manos()

def caminar(t):
    reposo(); esconder(caja, tablet)
    piernas_caminando(t); brazos_sueltos(t)

def caminar_caja(t):
    reposo(); esconder(tablet)
    piernas_caminando(t, paso=24); brazos_con_caja()
    rot('Spine1', -4, 0, 2 * math.sin(2 * math.pi * t))   # se echa un poco atrás por el peso
    caja_en_manos()

def trabajar(t):
    """Dejó la caja en el piso y trabaja con la tablet; teclea con una mano y asiente."""
    reposo(); mostrar(caja)
    caja.matrix_world = Matrix.Translation((0.30, -0.06, 0.075))
    f = 2 * math.pi * t
    rot('Spine1', 4); rot('Neck', 5); rot('Head', 4 + 3 * math.sin(f), 0, 0)
    rot('LeftArm', -48, 0, -12); rot('LeftForeArm', -55); rot('LeftHand', 0, 0, -20)
    rot('RightArm', -40, 0, 8); rot('RightForeArm', -55 - 10 * max(0.0, math.sin(2 * f)))
    rot('LeftEar', 4 * math.sin(f)); rot('RightEar', 4 * math.sin(f))
    mano = mundo_de('LeftHand', False)
    mostrar(tablet)
    tablet.matrix_world = (Matrix.Translation(mano + Vector((-0.06, -0.05, 0.0)))
                           @ giro_de('LeftForeArm').to_matrix().to_4x4()
                           @ Matrix.Rotation(R(90), 4, 'X'))

def salto():
    """Entregó la caja: festeja con los brazos arriba (el salto en sí lo hace la app)."""
    reposo(); esconder(caja, tablet)
    for lado, s in (('Left', 1), ('Right', -1)):
        rot(f'{lado}Arm', -15, 0, -s * 115); rot(f'{lado}ForeArm', -20)   # brazos abiertos en V (arriba la cabeza los tapa)
        rot(f'{lado}ShoulderPad', 0, 0, -s * 20)
    rot('LeftUpLeg', -25); rot('LeftLeg', 45); rot('RightUpLeg', 10); rot('RightLeg', 30)
    rot('LeftEar', -15); rot('RightEar', -15); rot('Head', -8)

def preocupado():
    """Se trabó: sostiene la caja, inclina la cabeza y baja las orejas."""
    reposo(); esconder(tablet); cara('preocupado')
    brazos_con_caja()
    rot('Spine1', 4); rot('Neck', 6); rot('Head', 4, 12, 0)   # ladea la cabeza sin darle la espalda a la cámara
    rot('LeftEar', -30); rot('RightEar', -30)   # orejas caídas hacia atrás
    caja_en_manos()

CUADROS = {'parado': parado, 'parado-caja': parado_caja, 'salto': salto, 'preocupado': preocupado}
for i in range(8):
    CUADROS[f'caminar-{i}'] = (lambda i=i: caminar(i / 8))
    CUADROS[f'caja-{i}'] = (lambda i=i: caminar_caja(i / 8))
for i in range(4):
    CUADROS[f'trabajar-{i}'] = (lambda i=i: trabajar(i / 4))

for nombre, armar in CUADROS.items():
    if solo and nombre not in solo:
        continue
    cara()
    armar()
    sc.render.filepath = f'{salida}/{nombre}.png'
    bpy.ops.render.render(write_still=True)
    print('Cuadro', nombre)
