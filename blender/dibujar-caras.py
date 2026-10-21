# Paso 4b: dibuja las caras extra de la pantalla del robot (la sonriente ya viene en el modelo).
# La imagen cubre la pantalla vista de frente: x de -0.14 a 0.14 m y z de 0.665 a 0.865 m (ver animar-robot.py).
# Mismo estilo que la cara original: trazos blancos gruesos y redondeados sobre la pantalla oscura.
# Uso: python dibujar-caras.py caras/
import sys
from pathlib import Path
from PIL import Image, ImageDraw

ANCHO_M, ALTO_M = 0.28, 0.20
PX_POR_M = 2000
ESCALA = 4  # se dibuja grande y se achica: bordes suaves
FONDO = (40, 41, 48)
TRAZO = (245, 245, 250)

def a_px(x, z):
    """De metros en la pantalla (x a los costados, z hacia arriba, centro en 0, 0.765) a píxeles."""
    return ((x + ANCHO_M / 2) * PX_POR_M * ESCALA, (ALTO_M / 2 - (z - 0.765)) * PX_POR_M * ESCALA)

def linea(d, puntos, grosor=0.014):
    pts = [a_px(*p) for p in puntos]
    g = grosor * PX_POR_M * ESCALA
    d.line(pts, fill=TRAZO, width=round(g), joint='curve')
    for x, y in (pts[0], pts[-1]):  # puntas redondeadas
        d.ellipse((x - g / 2, y - g / 2, x + g / 2, y + g / 2), fill=TRAZO)

def preocupado(d):
    for s in (-1, 1):
        cx = s * 0.058
        # cejas inclinadas: la punta de adentro más alta
        linea(d, [(cx + s * 0.028, 0.818), (cx - s * 0.022, 0.832)])
        # ojos: óvalos verticales
        x0, y0 = a_px(cx - 0.013, 0.808); x1, y1 = a_px(cx + 0.013, 0.768)
        d.ellipse((x0, y0, x1, y1), fill=TRAZO)
    # boca ondulada
    linea(d, [(-0.038, 0.727), (-0.019, 0.738), (0.0, 0.727), (0.019, 0.738), (0.038, 0.727)])

CARAS = {'preocupado': preocupado}

if __name__ == '__main__':
    destino = Path(sys.argv[1]); destino.mkdir(parents=True, exist_ok=True)
    tam = (round(ANCHO_M * PX_POR_M), round(ALTO_M * PX_POR_M))
    for nombre, dibujar in CARAS.items():
        img = Image.new('RGB', (tam[0] * ESCALA, tam[1] * ESCALA), FONDO)
        dibujar(ImageDraw.Draw(img))
        img.resize(tam, Image.LANCZOS).save(destino / f'{nombre}.png')
        print('Cara', nombre)
