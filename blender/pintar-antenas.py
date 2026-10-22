# Paso 2c: repinta las antenas. El generador les dibujó una ranura (franja clara entre dos líneas oscuras)
# que en la ficha no existe: ahí la antena es entera azul con garabatos. Se rellena la ranura con el mismo
# patrón azul, copiado de la zona del mapa de colores que más patrón tiene.
# El disco del auricular no se toca: en la ficha sí tiene su aro oscuro.
# Uso: blender -b modelo/robot-horneado.blend -P pintar-antenas.py -- <color entrada.png> <color salida.png>
import bpy, sys
import numpy as np
from mathutils import Vector

entrada, salida = sys.argv[sys.argv.index('--') + 1:][:2]
robot = [o for o in bpy.data.objects if o.type == 'MESH'][0]
mw = robot.matrix_world
malla = robot.data
uv = malla.uv_layers.active.data

# Mismas zonas que esqueleto-robot.py: oreja = arriba y bien a los costados; el disco va con su centro.
def es_oreja(p):
    return p.z > 0.72 and abs(p.x) > (0.19 if p.z > 0.90 else 0.198)

DIRECCION = Vector((0, 0.57, 0.82))  # la antena sale del disco hacia arriba y atrás

def es_vara(p):
    """La vara de la antena: lo que está más allá del disco, a lo largo de la antena (así no toca la cabeza)."""
    centro = Vector((0.215 if p.x > 0 else -0.215, 0.01, 0.80))
    return (p - centro).dot(DIRECCION) > 0.06

img = bpy.data.images.load(entrada)
W, H = img.size
px = np.empty(W * H * 4, np.float32); img.pixels.foreach_get(px)
px = px.reshape(H, W, 4)  # fila 0 = abajo, como el mapa UV

# --- Máscara: los triángulos UV de las caras de la antena ---
mascara = np.zeros((H, W), bool)
def pintar_triangulo(a, b, c):
    xs, ys = (a[0], b[0], c[0]), (a[1], b[1], c[1])
    x0, x1 = max(int(min(xs)) - 1, 0), min(int(max(xs)) + 2, W)
    y0, y1 = max(int(min(ys)) - 1, 0), min(int(max(ys)) + 2, H)
    if x0 >= x1 or y0 >= y1:
        return
    gx, gy = np.meshgrid(np.arange(x0, x1) + 0.5, np.arange(y0, y1) + 0.5)
    d = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1])
    if abs(d) < 1e-9:
        return
    l1 = ((b[1] - c[1]) * (gx - c[0]) + (c[0] - b[0]) * (gy - c[1])) / d
    l2 = ((c[1] - a[1]) * (gx - c[0]) + (a[0] - c[0]) * (gy - c[1])) / d
    adentro = (l1 >= -0.02) & (l2 >= -0.02) & (1 - l1 - l2 >= -0.02)
    mascara[y0:y1, x0:x1] |= adentro

caras = 0
for f in malla.polygons:
    p = mw @ f.center
    if not es_oreja(p) or not es_vara(p):
        continue
    caras += 1
    pts = [(uv[l].uv.x * W, uv[l].uv.y * H) for l in f.loop_indices]
    for i in range(1, len(pts) - 1):
        pintar_triangulo(pts[0], pts[i], pts[i + 1])
# se agranda 3 px para cubrir el margen de las costuras del mapa
for _ in range(3):
    m = mascara.copy()
    m[1:] |= mascara[:-1]; m[:-1] |= mascara[1:]; m[:, 1:] |= mascara[:, :-1]; m[:, :-1] |= mascara[:, 1:]
    mascara = m

# --- Patrón de origen: la ventana del mapa con más azul ---
r, g, b = px[..., 0], px[..., 1], px[..., 2]
azul = (b > r + 0.12) & (b > 0.5)                      # el celeste del patrón (sin el azul marino)
oscuro = (0.3 * r + 0.6 * g + 0.1 * b) < 0.3            # contornos y fondo vacío del mapa
LADO = 64
def sumas(m):
    i = np.pad(m.astype(np.int32).cumsum(0).cumsum(1), ((1, 0), (1, 0)))
    return i[LADO:, LADO:] - i[:-LADO, LADO:] - i[LADO:, :-LADO] + i[:-LADO, :-LADO]
puntaje = sumas(azul) - 20 * sumas(oscuro)              # mucho celeste y casi nada oscuro
puntaje[mascara[:puntaje.shape[0], :puntaje.shape[1]]] = -10 ** 9  # que no copie de la misma antena
y, x = np.unravel_index(np.argmax(puntaje), puntaje.shape)
patron = px[y:y + LADO, x:x + LADO].copy()
suma = sumas(azul)

# --- Relleno: la vara entera pasa a ser patrón azul (la ranura y sus líneas desaparecen;
# el contorno de afuera lo dibuja el render con estilo caricatura) ---
yy, xx = np.nonzero(mascara)
px[yy, xx] = patron[yy % LADO, xx % LADO]

img.pixels.foreach_set(px.ravel())
img.filepath_raw = salida; img.file_format = 'PNG'; img.save()
print(f'Antenas repintadas: {caras} caras, {len(yy)} píxeles; patrón tomado de ({x}, {y}) con {suma[y, x] * 100 // LADO ** 2}% de azul')
