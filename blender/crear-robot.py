# Arma el robot del postulador en Blender, pieza por pieza, siguiendo la ficha de 5 vistas.
# Uso (sin ventana): E:\Desarollo\blender.exe -b --factory-startup -P crear-robot.py
# Medidas en "decenas de pulgadas" de la ficha: el robot mide 7 unidades (70").
# Deja: robot.blend (modelo + esqueleto + 3 caras) y fotos de control en control/.

import bpy
import bmesh
import math
import os
from mathutils import Matrix, Vector, Quaternion

CARPETA = os.path.dirname(os.path.abspath(__file__))
CONTROL = os.path.join(CARPETA, "control")
os.makedirs(CONTROL, exist_ok=True)

# Cabeza: centro y radios (los usan la visera, la gorra y la cara)
CAB_C = Vector((0, 0, 5.6))
CAB_R = Vector((1.45, 1.4, 1.35))
PLANO = 0.28  # < 1 aplana el frente de la cabeza


# ---------- escena vacía ----------
for o in list(bpy.data.objects):
    bpy.data.objects.remove(o, do_unlink=True)
escena = bpy.context.scene
col_cuerpo = bpy.data.collections.new("Robot")
escena.collection.children.link(col_cuerpo)


# ---------- colores y materiales "toon" ----------
def lineal(hexa):
    def c(v):
        v /= 255
        return v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4
    return (c(int(hexa[1:3], 16)), c(int(hexa[3:5], 16)), c(int(hexa[5:7], 16)), 1)


def socket(lista, nombre, tipo):
    return next(s for s in lista if s.name == nombre and s.type == tipo)


def material_toon(nombre, color, patron=None):
    """Sombra en dos tonos (como dibujo). patron = color de los garabatos sobre el color base."""
    m = bpy.data.materials.new(nombre)
    try:
        m.use_nodes = True
    except Exception:
        pass
    n, l = m.node_tree.nodes, m.node_tree.links
    n.clear()
    salida = n.new("ShaderNodeOutputMaterial")
    difuso = n.new("ShaderNodeBsdfDiffuse")
    a_rgb = n.new("ShaderNodeShaderToRGB")
    luz = n.new("ShaderNodeValToRGB")
    luz.color_ramp.interpolation = "CONSTANT"
    luz.color_ramp.elements[0].position = 0.0
    luz.color_ramp.elements[0].color = (0.74, 0.73, 0.86, 1)  # sombra lila, como en la ficha
    luz.color_ramp.elements[1].position = 0.22
    luz.color_ramp.elements[1].color = (1, 1, 1, 1)
    l.new(difuso.outputs[0], a_rgb.inputs[0])
    l.new(a_rgb.outputs[0], luz.inputs[0])

    if patron:
        coords = n.new("ShaderNodeTexCoord")
        ruido = n.new("ShaderNodeTexNoise")
        ruido.inputs["Scale"].default_value = 1.6
        ruido.inputs["Detail"].default_value = 0.0
        ruido.inputs["Distortion"].default_value = 0.3
        veces = n.new("ShaderNodeMath")
        veces.operation = "MULTIPLY"
        veces.inputs[1].default_value = 9
        frac = n.new("ShaderNodeMath")
        frac.operation = "FRACT"
        rayas = n.new("ShaderNodeValToRGB")
        rayas.color_ramp.interpolation = "CONSTANT"
        e = rayas.color_ramp.elements
        e[0].position, e[0].color = 0.0, lineal(color)
        e[1].position, e[1].color = 0.44, lineal(patron)
        e3 = e.new(0.56)
        e3.color = lineal(color)
        l.new(coords.outputs["Object"], ruido.inputs["Vector"])
        l.new(ruido.outputs["Fac"], veces.inputs[0])
        l.new(veces.outputs[0], frac.inputs[0])
        l.new(frac.outputs[0], rayas.inputs[0])
        base = rayas.outputs[0]
    else:
        rgb = n.new("ShaderNodeRGB")
        rgb.outputs[0].default_value = lineal(color)
        base = rgb.outputs[0]

    mezcla = n.new("ShaderNodeMix")
    mezcla.data_type = "RGBA"
    mezcla.blend_type = "MULTIPLY"
    mezcla.inputs[0].default_value = 1.0
    l.new(base, socket(mezcla.inputs, "A", "RGBA"))
    l.new(luz.outputs[0], socket(mezcla.inputs, "B", "RGBA"))
    emision = n.new("ShaderNodeEmission")
    l.new(socket(mezcla.outputs, "Result", "RGBA"), emision.inputs["Color"])
    l.new(emision.outputs[0], salida.inputs["Surface"])
    return m


def material_brillo(nombre, color):
    m = bpy.data.materials.new(nombre)
    try:
        m.use_nodes = True
    except Exception:
        pass
    n = m.node_tree.nodes
    n.clear()
    em = n.new("ShaderNodeEmission")
    em.inputs["Color"].default_value = lineal(color)
    salida = n.new("ShaderNodeOutputMaterial")
    m.node_tree.links.new(em.outputs[0], salida.inputs["Surface"])
    return m


M = {
    "blanco": material_toon("blanco", "#F4F3F8"),
    "azul": material_toon("azul_garabatos", "#6E92C8", patron="#E3EBF8"),
    "metal": material_toon("metal", "#8F939D"),
    "oscuro": material_toon("articulacion", "#3B3E4C"),
    "mano": material_toon("mano", "#3A3D52"),
    "pantalla": material_toon("pantalla", "#15171F"),
    "rojo": material_toon("corbata", "#CC1F2A"),
    "suela": material_toon("suela", "#2C2E38"),
    "gris_zapa": material_toon("gris_zapatilla", "#A9ACB5"),
    "cara": material_brillo("cara", "#FFFFFF"),
}


# ---------- piezas ----------
def matriz(pos, escala=(1, 1, 1), rot=None):
    r = rot.to_matrix().to_4x4() if rot else Matrix.Identity(4)
    return Matrix.Translation(pos) @ r @ Matrix.Diagonal((*escala, 1))


def objeto(nombre, bm, mat, suave=True, coleccion=None):
    me = bpy.data.meshes.new(nombre)
    bm.to_mesh(me)
    bm.free()
    for p in me.polygons:
        p.use_smooth = suave
    me.materials.append(mat)
    o = bpy.data.objects.new(nombre, me)
    (coleccion or col_cuerpo).objects.link(o)
    return o


def esfera(nombre, pos, radios, mat, rot=None, seg=48, frente_plano=False):
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=seg, v_segments=seg // 2, radius=1)
    if frente_plano:
        for v in bm.verts:
            if v.co.y < 0:
                v.co.y = -(abs(v.co.y) ** PLANO)
    bmesh.ops.transform(bm, matrix=matriz(Vector(pos), radios, rot), verts=bm.verts)
    return objeto(nombre, bm, mat)


def caja(nombre, pos, mitades, mat, rot=None, redondeo=0.08, coleccion=None):
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=2)
    bmesh.ops.transform(bm, matrix=matriz(Vector(pos), mitades, rot), verts=bm.verts)
    o = objeto(nombre, bm, mat, suave=True, coleccion=coleccion)
    b = o.modifiers.new("redondeo", "BEVEL")
    b.width, b.segments = redondeo, 5
    b.limit_method = "NONE"
    return o


def entre(a, b):
    a, b = Vector(a), Vector(b)
    return (a + b) / 2, (b - a).length, Vector((0, 0, 1)).rotation_difference((b - a).normalized())


def cilindro(nombre, a, b, r, mat, r2=None, seg=32):
    medio, largo, rot = entre(a, b)
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=seg, radius1=r, radius2=r2 if r2 is not None else r, depth=largo)
    bmesh.ops.transform(bm, matrix=matriz(medio, rot=rot), verts=bm.verts)
    o = objeto(nombre, bm, mat)
    bv = o.modifiers.new("borde", "BEVEL")
    bv.width, bv.segments = min(r * 0.25, 0.04), 3
    return o


def ovalo(nombre, a, b, r, mat, r_y=None):
    """Elipsoide estirado entre dos puntos (brazos, piernas, antenas)."""
    medio, largo, rot = entre(a, b)
    return esfera(nombre, medio, (r, r_y or r, largo / 2), mat, rot)


col_aux = bpy.data.collections.new("aux")
escena.collection.children.link(col_aux)


def recorte(nombre, escala, centro, mitades, mat, redondeo):
    """Copia de la cabeza un poco más grande, recortada por una caja redondeada (visera, gorra)."""
    o = esfera(nombre, CAB_C, CAB_R * escala, mat, seg=128, frente_plano=True)
    corte = caja("corte_" + nombre, centro, mitades, mat, redondeo=redondeo, coleccion=col_aux)
    b = o.modifiers.new("recorte", "BOOLEAN")
    b.operation, b.object, b.solver = "INTERSECT", corte, "EXACT"
    bpy.context.view_layer.update()
    with bpy.context.temp_override(object=o, active_object=o, selected_objects=[o]):
        bpy.ops.object.modifier_apply(modifier="recorte")
    bpy.data.objects.remove(corte, do_unlink=True)
    return o


piezas = {}  # nombre de hueso -> lista de objetos


def a(hueso, *objs):
    piezas.setdefault(hueso, []).extend(objs)


# Cabeza
a("cabeza", esfera("cabeza", CAB_C, CAB_R, M["blanco"], seg=96, frente_plano=True))


a("cabeza",
  recorte("visera", 1.015, (0, -2.5, 5.48), (1.1, 2.2, 0.8), M["pantalla"], 0.38),
  recorte("gorra_franja", 1.022, (0, 1.4, 6.9), (0.6, 1.6, 1.15), M["azul"], 0.2),
  recorte("gorra_frente", 1.022, (0, -1.5, 7.2), (0.95, 1.5, 0.9), M["azul"], 0.2),
  caja("visera_gorra", (0, -1.55, 6.45), (0.92, 0.45, 0.09), M["azul"],
       rot=Quaternion((1, 0, 0), math.radians(-10)), redondeo=0.04))

for lado, s in (("L", 1), ("R", -1)):
    a("cabeza",
      cilindro(f"auricular.{lado}", (s * 1.25, 0.28, 5.6), (s * 1.52, 0.28, 5.6), 0.34, M["oscuro"]),
      cilindro(f"auricular_tapa.{lado}", (s * 1.5, 0.28, 5.6), (s * 1.56, 0.28, 5.6), 0.23, M["azul"]),
      ovalo(f"antena.{lado}", (s * 1.48, 0.2, 5.5), (s * 1.32, 1.12, 7.05), 0.13, M["azul"], r_y=0.24))

# Cuello y torso
a("pecho",
  cilindro("cuello", (0, 0, 3.95), (0, 0, 4.45), 0.17, M["oscuro"]),
  caja("torso", (0, -0.08, 3.5), (0.74, 0.52, 0.55), M["blanco"], redondeo=0.3),
  caja("canesu", (0, -0.08, 3.92), (0.78, 0.56, 0.16), M["azul"], redondeo=0.14),
  caja("faja", (0, -0.08, 3.02), (0.7, 0.5, 0.12), M["azul"], redondeo=0.11),
  esfera("nudo", (0, -0.6, 3.93), (0.07, 0.05, 0.06), M["rojo"]))

# Corbata: rombo alargado
bm = bmesh.new()
bmesh.ops.create_cone(bm, cap_ends=True, segments=4, radius1=0.0, radius2=0.15, depth=0.7)
bmesh.ops.transform(bm, matrix=matriz(Vector((0, -0.62, 3.55)), (1, 0.3, 1),
                                      Quaternion((0, 0, 1), math.radians(45))), verts=bm.verts)
a("pecho", objeto("corbata", bm, M["rojo"], suave=False))

# Espalda: columna mecánica
for i, z in enumerate((3.1, 3.3, 3.5)):
    a("pecho", caja(f"columna.{i}", (0, 0.45, z), (0.2, 0.06, 0.07), M["metal"], redondeo=0.04))

# Cintura y cadera
a("cadera",
  cilindro("cintura", (0, -0.06, 2.62), (0, -0.06, 2.9), 0.5, M["oscuro"]),
  caja("cadera", (0, -0.06, 2.32), (0.56, 0.42, 0.26), M["blanco"], redondeo=0.2))
for i in range(5):
    ang = math.radians(-60 + i * 30)
    a("cadera", esfera(f"tornillo.{i}", (0.5 * math.sin(ang), -0.06 - 0.5 * math.cos(ang), 2.76),
                       (0.045, 0.045, 0.045), M["metal"], seg=16))

# Brazos y piernas
for lado, s in (("L", 1), ("R", -1)):
    a(f"brazo.{lado}",
      esfera(f"hombrera.{lado}", (s * 0.85, -0.05, 3.85), (0.38, 0.4, 0.32), M["azul"]),
      cilindro(f"brazo.{lado}", (s * 0.98, 0, 3.7), (s * 1.18, 0, 3.1), 0.13, M["metal"]),
      esfera(f"codo.{lado}", (s * 1.2, 0, 3.06), (0.18, 0.18, 0.18), M["oscuro"]))
    a(f"antebrazo.{lado}",
      ovalo(f"antebrazo.{lado}", (s * 1.22, 0, 3.0), (s * 1.34, 0, 2.28), 0.28, M["blanco"]),
      esfera(f"puno.{lado}", (s * 1.25, 0, 2.95), (0.24, 0.24, 0.12), M["azul"]))
    a(f"mano.{lado}",
      esfera(f"mano.{lado}", (s * 1.38, 0, 2.05), (0.15, 0.2, 0.25), M["mano"]),
      ovalo(f"pulgar.{lado}", (s * 1.33, -0.12, 2.2), (s * 1.3, -0.2, 2.0), 0.06, M["mano"]))
    a(f"muslo.{lado}",
      ovalo(f"muslo.{lado}", (s * 0.34, -0.06, 2.2), (s * 0.4, -0.06, 1.7), 0.24, M["blanco"]),
      cilindro(f"muslo_metal.{lado}", (s * 0.4, -0.06, 1.85), (s * 0.4, -0.06, 1.55), 0.15, M["metal"]))
    a(f"pierna.{lado}",
      esfera(f"rodilla.{lado}", (s * 0.4, -0.06, 1.5), (0.27, 0.27, 0.27), M["oscuro"]),
      cilindro(f"rodilla_aro.{lado}", (s * 0.4, -0.25, 1.5), (s * 0.4, -0.32, 1.5), 0.15, M["metal"]),
      cilindro(f"canilla.{lado}", (s * 0.4, -0.06, 1.4), (s * 0.42, -0.06, 0.8), 0.17, M["metal"]))
    a(f"pie.{lado}",
      caja(f"zapatilla.{lado}", (s * 0.47, -0.05, 0.52), (0.36, 0.38, 0.42), M["blanco"], redondeo=0.22),
      caja(f"puntera.{lado}", (s * 0.47, -0.7, 0.3), (0.36, 0.5, 0.22), M["blanco"], redondeo=0.2),
      caja(f"talon.{lado}", (s * 0.47, 0.12, 0.3), (0.37, 0.25, 0.18), M["gris_zapa"], redondeo=0.12),
      caja(f"suela.{lado}", (s * 0.47, -0.42, 0.07), (0.39, 0.82, 0.07), M["suela"], redondeo=0.06))


# ---------- caras (una colección por expresión) ----------
def sobre_visera(x, z):
    r = CAB_R * 1.012
    k = 1 - (x / r.x) ** 2 - ((z - CAB_C.z) / r.z) ** 2
    return Vector((x, -r.y * math.sqrt(max(k, 0)) ** PLANO - 0.06, z))


def trazo(nombre, puntos, coleccion, grosor=0.06):
    cu = bpy.data.curves.new(nombre, "CURVE")
    cu.dimensions = "3D"
    cu.bevel_depth = grosor
    cu.bevel_resolution = 3
    cu.use_fill_caps = True
    sp = cu.splines.new("POLY")
    sp.points.add(len(puntos) - 1)
    for p, (x, z) in zip(sp.points, puntos):
        p.co = (*sobre_visera(x, z), 1)
    cu.materials.append(M["cara"])
    o = bpy.data.objects.new(nombre, cu)
    coleccion.objects.link(o)
    a("cabeza", o)
    return o


def arco(cx, cz, r, desde, hasta, n=24, rz=None):
    rz = rz or r
    return [(cx + r * math.cos(math.radians(t)), cz + rz * math.sin(math.radians(t)))
            for t in (desde + (hasta - desde) * i / (n - 1) for i in range(n))]


caras = {}
for expresion in ("feliz", "concentrado", "preocupado"):
    c = bpy.data.collections.new(f"Cara_{expresion}")
    escena.collection.children.link(c)
    caras[expresion] = c

for s in (1, -1):
    # feliz: ojos ∩ y sonrisa
    trazo("ojo_feliz", arco(s * 0.4, 5.55, 0.2, 20, 160), caras["feliz"])
    # concentrado: ojos rayita y boca recta
    trazo("ojo_concentrado", [(s * 0.28, 5.55), (s * 0.56, 5.52)], caras["concentrado"], 0.045)
    # preocupado: ojos redondos y cejas caídas
    trazo("ojo_preocupado", arco(s * 0.42, 5.5, 0.1, 0, 360, n=32), caras["preocupado"], 0.045)
    trazo("ceja_preocupado", [(s * 0.3, 5.78), (s * 0.56, 5.7)], caras["preocupado"], 0.03)
trazo("boca_feliz", arco(0, 5.25, 0.25, 200, 340), caras["feliz"])
trazo("boca_concentrado", [(-0.13, 5.17), (0.13, 5.17)], caras["concentrado"])
trazo("boca_preocupado", [(-0.2 + 0.4 * i / 16, 5.15 + 0.035 * math.sin(i * math.pi / 4)) for i in range(17)],
      caras["preocupado"], 0.03)


def mostrar_cara(nombre):
    for k, c in caras.items():
        c.hide_render = c.hide_viewport = k != nombre


mostrar_cara("feliz")


# ---------- esqueleto ----------
huesos = {
    # nombre: (cabeza, cola, padre)
    "raiz": ((0, 0, 0), (0, 0.6, 0), None),
    "cadera": ((0, -0.06, 2.2), (0, -0.06, 2.75), "raiz"),
    "pecho": ((0, -0.06, 2.75), (0, -0.06, 4.0), "cadera"),
    "cabeza": ((0, 0, 4.0), (0, 0, 5.6), "pecho"),
}
for lado, s in (("L", 1), ("R", -1)):
    huesos.update({
        f"brazo.{lado}": ((s * 0.95, 0, 3.75), (s * 1.2, 0, 3.06), "pecho"),
        f"antebrazo.{lado}": ((s * 1.2, 0, 3.06), (s * 1.34, 0, 2.3), f"brazo.{lado}"),
        f"mano.{lado}": ((s * 1.34, 0, 2.3), (s * 1.38, 0, 1.85), f"antebrazo.{lado}"),
        f"muslo.{lado}": ((s * 0.34, -0.06, 2.25), (s * 0.4, -0.06, 1.5), "cadera"),
        f"pierna.{lado}": ((s * 0.4, -0.06, 1.5), (s * 0.45, -0.05, 0.55), f"muslo.{lado}"),
        f"pie.{lado}": ((s * 0.45, -0.05, 0.55), (s * 0.47, -0.9, 0.3), f"pierna.{lado}"),
    })

datos = bpy.data.armatures.new("esqueleto")
esqueleto = bpy.data.objects.new("esqueleto", datos)
col_cuerpo.objects.link(esqueleto)
bpy.context.view_layer.objects.active = esqueleto
bpy.ops.object.mode_set(mode="EDIT")
for nombre, (cab, cola, padre) in huesos.items():
    h = datos.edit_bones.new(nombre)
    h.head, h.tail = cab, cola
    if padre:
        h.parent = datos.edit_bones[padre]
        h.use_connect = False
bpy.ops.object.mode_set(mode="OBJECT")

# Cada pieza va pegada a su hueso como en un muñeco de Lego (sin pesos)
for hueso, objs in piezas.items():
    for o in objs:
        o.parent = esqueleto
        o.parent_type = "BONE"
        o.parent_bone = hueso
bpy.context.view_layer.update()
for objs in piezas.values():
    for o in objs:
        o.matrix_world = Matrix.Identity(4)
bpy.context.view_layer.update()


# ---------- referencias de la ficha (solo se ven en el visor) ----------
col_ref = bpy.data.collections.new("Referencias")
escena.collection.children.link(col_ref)
PX = 0.1 / (9.73 * 2752 / 2000)  # unidades por píxel de la ficha
for archivo, pos, rot, ancho_px in (
    ("ref-frente.png", (0.01, 4, 3.6), (90, 0, 0), 1040),
    ("ref-perfil.png", (4, -0.2, 3.6), (90, 0, -90), 1040),
):
    ruta = os.path.join(CARPETA, archivo)
    if not os.path.exists(ruta):
        continue
    e = bpy.data.objects.new(archivo, None)
    e.empty_display_type = "IMAGE"
    e.data = bpy.data.images.load(ruta)
    e.empty_display_size = ancho_px * PX
    e.location = pos
    e.rotation_euler = [math.radians(v) for v in rot]
    e.color[3] = 0.5
    e.use_empty_image_alpha = True
    col_ref.objects.link(e)


# ---------- render: cámara plana, fondo transparente, contorno ----------
motores = [i.identifier for i in bpy.types.RenderSettings.bl_rna.properties["engine"].enum_items]
escena.render.engine = next(m for m in ("BLENDER_EEVEE_NEXT", "BLENDER_EEVEE") if m in motores)
escena.eevee.taa_render_samples = 16
escena.render.film_transparent = True
escena.render.resolution_x, escena.render.resolution_y = 640, 960
escena.view_settings.view_transform = "Standard"
escena.world = bpy.data.worlds.new("mundo")
escena.world.color = (0.02, 0.02, 0.02)

escena.render.use_freestyle = True
escena.render.line_thickness_mode = "ABSOLUTE"
escena.render.line_thickness = 1.0
fs = bpy.context.view_layer.freestyle_settings
linea = fs.linesets[0] if len(fs.linesets) else fs.linesets.new("contorno")
linea.select_by_collection = True
linea.collection = col_cuerpo
linea.select_crease = False
linea.linestyle.color = (0.06, 0.06, 0.14)
linea.linestyle.thickness = 3.0

sol = bpy.data.objects.new("sol", bpy.data.lights.new("sol", "SUN"))
sol.data.energy = 4
escena.collection.objects.link(sol)

cam = bpy.data.objects.new("camara", bpy.data.cameras.new("camara"))
cam.data.type = "ORTHO"
cam.data.ortho_scale = 7.8
cam.data.clip_end = 100
escena.collection.objects.link(cam)
escena.camera = cam


def apuntar(giro):
    g = math.radians(giro)
    cam.location = (20 * math.sin(g), -20 * math.cos(g), 3.6)
    cam.rotation_euler = (math.radians(90), 0, g)
    sol.rotation_euler = (math.radians(50), 0, g - math.radians(30))


def foto(nombre):
    escena.render.filepath = os.path.join(CONTROL, nombre + ".png")
    bpy.ops.render.render(write_still=True)


import sys
solo_guardar = "--sin-fotos" in sys.argv

# Pose de reposo apuntando de frente, y se guarda el archivo antes de las fotos
apuntar(0)
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(CARPETA, "robot.blend"))

if not solo_guardar:
    for nombre, giro in (("frente", 0), ("espalda", 180), ("perfil", -90), ("perfil-der", 90), ("tres-cuartos", -35)):
        apuntar(giro)
        foto(nombre)
    for expresion in ("concentrado", "preocupado"):
        mostrar_cara(expresion)
        apuntar(0)
        foto("cara-" + expresion)
    mostrar_cara("feliz")

    # Prueba del esqueleto: paso de caminata
    pb = esqueleto.pose.bones
    pose = {"brazo.L": 35, "brazo.R": -35, "antebrazo.L": 25, "antebrazo.R": 15,
            "muslo.L": -30, "muslo.R": 25, "pierna.L": 25, "pierna.R": 10}
    for h, grados in pose.items():
        pb[h].rotation_mode = "XYZ"
        pb[h].rotation_euler = (math.radians(grados), 0, 0)
    apuntar(-90)
    foto("prueba-paso")
    for h in pose:
        pb[h].rotation_euler = (0, 0, 0)

print("LISTO robot.blend")
