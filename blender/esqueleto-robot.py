# Paso 3: le pone esqueleto al robot horneado (sin Mixamo).
# Articulaciones tipo bisagra: cada pieza la mueve un solo hueso, el corte pasa por la costura entre piezas
# y el punto de giro va en el centro de la pieza redonda (disco de la rodilla, del codo, del auricular),
# así doblar no estira ni aplasta nada. Medidas tomadas de las vistas con grilla de control/rig/.
# Nombres de huesos estilo Mixamo, por si algún día se quieren usar sus animaciones.
# Uso: blender -b modelo/robot-horneado.blend -P esqueleto-robot.py -- modelo/robot-con-esqueleto.blend [textura.png]
# (textura.png opcional: la de colores corregidos que deja recolorear-robot.py)
import bpy, bmesh, sys
from mathutils import Vector, geometry

args = sys.argv[sys.argv.index('--') + 1:]
salida = args[0]
robot = [o for o in bpy.data.objects if o.type == 'MESH'][0]
if len(args) > 1:
    color = bpy.data.images['robot_color']
    color.unpack(method='REMOVE')
    color.filepath = args[1]; color.reload(); color.pack()
# el horneado viene con un giro guardado en el objeto (Y arriba): se aplica a la malla para trabajar en metros reales
robot.data.transform(robot.matrix_world)
robot.parent = None
robot.matrix_world = robot.matrix_world.Identity(4)

# El robot mira hacia -Y; su izquierda es +X. Medidas en metros.
HUESOS = {  # nombre: (cabeza = punto de giro, cola, padre)
    'Hips':   ((0, 0.01, 0.300), (0, 0.01, 0.375), None),
    'Spine':  ((0, 0.01, 0.375), (0, 0.01, 0.415), 'Hips'),    # faja azul
    'Spine1': ((0, 0.01, 0.415), (0, 0.01, 0.565), 'Spine'),   # pecho
    'Neck':   ((0, 0.01, 0.565), (0, 0.01, 0.605), 'Spine1'),
    'Head':   ((0, 0.01, 0.605), (0, 0.01, 0.850), 'Neck'),
}
for lado, s in (('Left', 1), ('Right', -1)):
    HUESOS.update({
        f'{lado}Ear':          ((s * 0.215, 0.01, 0.800), (s * 0.215, 0.150, 1.000), 'Head'),    # centro del auricular
        f'{lado}ShoulderPad':  ((s * 0.150, 0.01, 0.510), (s * 0.150, 0.010, 0.570), 'Spine1'),
        f'{lado}Arm':          ((s * 0.155, 0.01, 0.500), (s * 0.170, 0.010, 0.455), 'Spine1'),
        f'{lado}ForeArm':      ((s * 0.170, 0.01, 0.455), (s * 0.190, 0.010, 0.310), f'{lado}Arm'),  # disco del codo
        f'{lado}Hand':         ((s * 0.190, 0.01, 0.310), (s * 0.195, 0.010, 0.210), f'{lado}ForeArm'),
        f'{lado}UpLeg':        ((s * 0.070, 0.00, 0.265), (s * 0.075, 0.000, 0.185), 'Hips'),
        f'{lado}Leg':          ((s * 0.075, 0.00, 0.185), (s * 0.075, 0.005, 0.130), f'{lado}UpLeg'),  # disco de la rodilla
        f'{lado}Foot':         ((s * 0.075, 0.005, 0.130), (s * 0.075, -0.070, 0.030), f'{lado}Leg'),
        f'{lado}ToeBase':      ((s * 0.075, -0.07, 0.030), (s * 0.075, -0.150, 0.020), f'{lado}Foot'),
    })

# --- Armadura ---
arm_d = bpy.data.armatures.new('esqueleto')
arm = bpy.data.objects.new('esqueleto', arm_d)
bpy.context.scene.collection.objects.link(arm)
bpy.context.view_layer.objects.active = arm
bpy.ops.object.mode_set(mode='EDIT')
for nombre, (c, t, _) in HUESOS.items():
    b = arm_d.edit_bones.new(nombre); b.head = c; b.tail = t
    b.roll = 0
for nombre, (_, _, padre) in HUESOS.items():
    if padre:
        b = arm_d.edit_bones[nombre]; b.parent = arm_d.edit_bones[padre]
        b.use_connect = (Vector(b.head) - Vector(b.parent.tail)).length < 1e-4
bpy.ops.object.mode_set(mode='OBJECT')

# --- Pesos por piezas ---
def corte(valor, limite, mezcla=0.004):
    """0 por debajo del límite, 1 por encima, con una rampa corta (4 mm) para que la costura no se serruche."""
    return min(1.0, max(0.0, (valor - limite) / mezcla + 0.5))

def distancia(p, hueso):
    c, t, _ = HUESOS[hueso]
    _, f = geometry.intersect_point_line(p, Vector(c), Vector(t))
    return (p - Vector(c).lerp(Vector(t), min(1.0, max(0.0, f)))).length

def es_oreja(p):
    # arriba de la cabeza (que ahí se angosta) la antena empieza más adentro
    return p.z > 0.72 and abs(p.x) > (0.19 if p.z > 0.90 else 0.198)

def es_brazo(p, s):
    ax = abs(p.x)
    if not 0.19 < p.z < 0.60 or ax < 0.105:
        return False
    if p.z > 0.505:          # hombrera
        return True
    if p.z > 0.33:           # arriba de la muñeca no hay piernas cerca
        return ax > 0.12
    # a la altura de la mano: va con el hueso más cercano (mano o muslo); así el pulgar
    # queda en la mano y el borde de la rodilla en la pierna
    return distancia(p, f'{s}Hand') < distancia(p, f'{s}UpLeg')

def pesos_brazo(p, s):
    ax = abs(p.x)
    if p.z > 0.505:
        return {f'{s}ShoulderPad': 1}
    codo = corte(p.z, min(0.44, 0.395 + (ax - 0.13) * 0.61))    # borde de arriba del puño del antebrazo
    muneca = corte(p.z, 0.315 - (ax - 0.145) * 0.4)             # borde de abajo del antebrazo
    return {f'{s}Arm': codo, f'{s}ForeArm': muneca * (1 - codo), f'{s}Hand': 1 - muneca}

def pesos_pierna(p, s):
    cadera = corte(p.z, 0.252 + (abs(p.x) - 0.03) * 0.7)       # línea del "short", sube hacia afuera
    rodilla = corte(p.z, 0.228)                                 # arriba del disco: el disco va con la canilla
    tobillo = corte(p.z, 0.140)                                 # borde de la zapatilla
    punta = 1 - corte(-p.y, 0.07) * (1 - corte(p.z, 0.06))     # punta del pie: adelante y abajo
    return {'Hips': cadera,
            f'{s}UpLeg': rodilla * (1 - cadera),
            f'{s}Leg': tobillo * (1 - rodilla),
            f'{s}Foot': (1 - tobillo) * punta,
            f'{s}ToeBase': (1 - tobillo) * (1 - punta)}

def pesos(p):
    s = 'Left' if p.x > 0 else 'Right'
    if es_oreja(p):
        return {f'{s}Ear': 1}
    if es_brazo(p, s):
        return pesos_brazo(p, s)
    if p.z < 0.252 + (abs(p.x) - 0.03) * 0.7 + 0.01:
        return pesos_pierna(p, s)
    if 0.555 < p.z < 0.62 and abs(p.x) < 0.07:                  # cuello
        cabeza = corte(p.z, 0.605); cuello = corte(p.z, 0.568)
        return {'Spine1': 1 - cuello, 'Neck': cuello * (1 - cabeza), 'Head': cabeza}
    if p.z > 0.6:
        return {'Head': 1}
    faja = corte(p.z, 0.375, 0.008); pecho = corte(p.z, 0.415, 0.008)
    return {'Hips': 1 - faja, 'Spine': faja * (1 - pecho), 'Spine1': pecho}

# --- Cortar la malla en piezas ---
# Cada cara va con el hueso que domina en su centro. Donde se tocan caras de piezas distintas la malla se
# separa, así cada pieza gira sola (se mete un poco debajo de la vecina) en vez de estirar una "tela" continua.
# El tronco queda continuo: ahí los giros son chicos y una franja de mezcla se ve mejor que un corte.
TRONCO = {'Hips', 'Spine', 'Spine1', 'Neck'}
pieza = lambda hueso: 'tronco' if hueso in TRONCO else hueso
mw = robot.matrix_world

def hueso_principal(p):
    return max(pesos(p).items(), key=lambda kv: kv[1])[0]

bm = bmesh.new(); bm.from_mesh(robot.data)
# Antes de separar, se corta la malla con planos rectos en cada costura: así el borde de cada pieza queda
# limpio en vez de seguir el serrucho de los triángulos.
PLANOS = [  # (punto, normal) en el lado izquierdo; se espejan al derecho
    ((0.03, 0, 0.252), (-0.7, 0, 1)),     # cadera (línea del short)
    ((0, 0, 0.228), (0, 0, 1)),           # rodilla
    ((0, 0, 0.140), (0, 0, 1)),           # tobillo
    ((0, -0.07, 0), (0, 1, 0)),           # punta del pie
    ((0, 0, 0.06), (0, 0, 1)),
    ((0.13, 0, 0.395), (-0.61, 0, 1)),    # codo
    ((0, 0, 0.44), (0, 0, 1)),
    ((0.145, 0, 0.315), (0.4, 0, 1)),     # muñeca
    ((0, 0, 0.505), (0, 0, 1)),           # hombrera
    ((0.12, 0, 0), (1, 0, 0)),            # brazo / costado del pecho
    ((0.105, 0, 0), (1, 0, 0)),
    ((0.198, 0, 0), (1, 0, 0)),           # oreja
    ((0.19, 0, 0), (1, 0, 0)),
    ((0, 0, 0.90), (0, 0, 1)),
    ((0, 0, 0.605), (0, 0, 1)),           # cuello / cabeza
]
for (px, py, pz), (nx, ny, nz) in PLANOS:
    for s in ((1, -1) if px or nx else (1,)):
        geom = bm.verts[:] + bm.edges[:] + bm.faces[:]
        bmesh.ops.bisect_plane(bm, geom=geom, plane_co=(s * px, py, pz), plane_no=(s * nx, ny, nz))
hueso_cara = {f: hueso_principal(mw @ f.calc_center_median()) for f in bm.faces}
costuras = [e for e in bm.edges if len(e.link_faces) == 2
            and pieza(hueso_cara[e.link_faces[0]]) != pieza(hueso_cara[e.link_faces[1]])]
bmesh.ops.split_edges(bm, edges=costuras)
# después de cortar, cada vértice toca caras de una sola pieza
hueso_vert = {}
for f in bm.faces:
    for v in f.verts:
        hueso_vert[v.index] = hueso_cara[f]
bm.to_mesh(robot.data); bm.free()
print('Costuras cortadas:', len(costuras))

grupos = {n: robot.vertex_groups.new(name=n) for n in HUESOS}
pantalla = robot.vertex_groups.new(name='Pantalla')  # no es hueso: marca la cara para las 3 expresiones
for v in robot.data.vertices:
    p = mw @ v.co
    h = hueso_vert.get(v.index)
    if h is None or h in TRONCO:   # tronco: mezcla suave, pero solo entre huesos del tronco
        reparto = {n: w for n, w in pesos(p).items() if n in TRONCO and w > 0.001} or {h or 'Hips': 1.0}
    else:                          # pieza suelta: un solo hueso, sin mezcla
        reparto = {h: 1.0}
    for n, w in reparto.items():
        grupos[n].add([v.index], w, 'REPLACE')
    if p.y < -0.12 and 0.66 < p.z < 0.865 and abs(p.x) < 0.16:
        pantalla.add([v.index], 1.0, 'REPLACE')

mod = robot.modifiers.new('esqueleto', 'ARMATURE'); mod.object = arm
robot.parent = arm
bpy.ops.wm.save_as_mainfile(filepath=salida)
print('Esqueleto listo:', salida, len(HUESOS), 'huesos')
