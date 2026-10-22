# Paso 4b: dibuja las caras extra de la pantalla del robot (la sonriente ya viene en el modelo).
# La imagen cubre la pantalla vista de frente: x de -0.14 a 0.14 m y z de 0.665 a 0.865 m (ver animar-robot.py).
# Mismo estilo que la cara original: trazos blancos gruesos y redondeados sobre la pantalla oscura.
# Uso: python dibujar-caras.py caras/
import math
import random
import sys
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ANCHO_M, ALTO_M = 0.28, 0.20
PX_POR_M = 2000
ESCALA = 4  # se dibuja grande y se achica: bordes suaves
FONDO = (40, 41, 48)
TRAZO = (245, 245, 250)
APAGADO = (95, 97, 110)
OJOS_X, OJOS_Z = 0.058, 0.788  # centro de cada ojo (a izquierda y derecha)
FUENTE = 'C:/Windows/Fonts/arialbd.ttf'

def a_px(x, z):
    """De metros en la pantalla (x a los costados, z hacia arriba, centro en 0, 0.765) a píxeles."""
    return ((x + ANCHO_M / 2) * PX_POR_M * ESCALA, (ALTO_M / 2 - (z - 0.765)) * PX_POR_M * ESCALA)

def m_px(metros):
    return metros * PX_POR_M * ESCALA

def linea(d, puntos, grosor=0.014, color=TRAZO):
    pts = [a_px(*p) for p in puntos]
    g = m_px(grosor)
    d.line(pts, fill=color, width=round(g), joint='curve')
    for x, y in (pts[0], pts[-1]):  # puntas redondeadas
        d.ellipse((x - g / 2, y - g / 2, x + g / 2, y + g / 2), fill=color)

def circulo(d, x, z, radio, color=TRAZO):
    cx, cy = a_px(x, z); r = m_px(radio)
    d.ellipse((cx - r, cy - r, cx + r, cy + r), fill=color)

def texto(d, x, z, cadena, alto=0.06):
    fuente = ImageFont.truetype(FUENTE, round(m_px(alto)))
    d.text(a_px(x, z), cadena, fill=TRAZO, font=fuente, anchor='mm')

def boca_recta(d, ancho=0.05, z=0.728):
    linea(d, [(-ancho / 2, z), (ancho / 2, z)])

# --- Caras ---
def preocupado(d):
    for s in (-1, 1):
        cx = s * OJOS_X
        linea(d, [(cx + s * 0.028, 0.818), (cx - s * 0.022, 0.832)])  # cejas: la punta de adentro más alta
        x0, y0 = a_px(cx - 0.013, 0.808); x1, y1 = a_px(cx + 0.013, 0.768)
        d.ellipse((x0, y0, x1, y1), fill=TRAZO)
    linea(d, [(-0.038, 0.727), (-0.019, 0.738), (0.0, 0.727), (0.019, 0.738), (0.038, 0.727)])

def engranaje(giro):
    """Ojos de engranaje (piensa); `giro` en grados para que parezcan girar entre cuadros."""
    def dibujar(d):
        for s in (-1, 1):
            cx, cz = s * OJOS_X, OJOS_Z
            pts = []
            for i in range(32):  # 8 dientes: 4 puntos por diente
                a = math.radians(giro * s + i * 360 / 32)
                r = 0.030 if (i % 4) in (0, 1) else 0.022
                pts.append(a_px(cx + r * math.cos(a), cz + r * math.sin(a)))
            d.polygon(pts, fill=TRAZO)
            circulo(d, cx, cz, 0.009, FONDO)
        boca_recta(d)
    return dibujar

def carga(encendidos):
    """Tres puntos de "cargando…" en lugar de los ojos."""
    def dibujar(d):
        for i, x in enumerate((-0.05, 0.0, 0.05)):
            circulo(d, x, OJOS_Z, 0.015, TRAZO if i < encendidos else APAGADO)
        boca_recta(d, 0.03)
    return dibujar

def pregunta(d):
    for s in (-1, 1):
        texto(d, s * OJOS_X, OJOS_Z, '?', 0.075)
    linea(d, [(-0.03, 0.728), (0.0, 0.735), (0.03, 0.728)])

def binario(izq, der):
    def dibujar(d):
        texto(d, -OJOS_X, OJOS_Z, izq, 0.068)
        texto(d, OJOS_X, OJOS_Z, der, 0.068)
        boca_recta(d)
    return dibujar

def espiral(d):
    """Mareado después del cortocircuito."""
    for s in (-1, 1):
        cx, cz = s * OJOS_X, OJOS_Z
        # 2,5 vueltas; cada vuelta se separa 1 cm de la anterior para que no se peguen
        pts = [(cx + 0.0017 * a * math.cos(a * s), cz + 0.0017 * a * math.sin(a * s)) for a in [i * 0.2 for i in range(5, 80)]]
        linea(d, pts, 0.005)
    linea(d, [(-0.035, 0.725), (-0.012, 0.735), (0.012, 0.722), (0.035, 0.732)])

def estatica(semilla):
    """Pantalla sin señal: franjas horizontales y puntitos al azar."""
    def dibujar(d):
        azar = random.Random(semilla)
        w, h = m_px(ANCHO_M), m_px(ALTO_M)
        y = 0
        while y < h:
            alto = azar.uniform(0.004, 0.02) * PX_POR_M * ESCALA
            gris = azar.choice((55, 75, 110, 160, 220))
            d.rectangle((0, y, w, y + alto), fill=(gris, gris, gris + 8))
            y += alto
        for _ in range(500):
            x0, y0 = azar.uniform(0, w), azar.uniform(0, h)
            t = azar.uniform(4, 14)
            d.rectangle((x0, y0, x0 + t * 3, y0 + t), fill=TRAZO if azar.random() < 0.5 else FONDO)
    return dibujar

def golpe(d):
    """¡Auch!: ojos apretados en > < y boca ondulada."""
    for s in (-1, 1):
        cx = s * OJOS_X
        # la punta del > apunta hacia el centro de la cara
        linea(d, [(cx + s * 0.018, 0.808), (cx - s * 0.016, 0.788), (cx + s * 0.018, 0.768)], 0.013)
    linea(d, [(-0.03, 0.728), (-0.015, 0.738), (0.0, 0.728), (0.015, 0.738), (0.03, 0.728)])

def molesto(d):
    """Enojado: cejas en V (la punta de adentro más baja), ojos chicos y boca hacia abajo."""
    for s in (-1, 1):
        cx = s * OJOS_X
        linea(d, [(cx + s * 0.028, 0.835), (cx - s * 0.024, 0.814)])
        circulo(d, cx + s * 0.002, 0.790, 0.012)
    linea(d, [(-0.032, 0.722), (-0.016, 0.733), (0.016, 0.733), (0.032, 0.722)])

def flauta(d):
    """Tocando la flauta: ojos cerrados felices (^ ^) y boca en "o", soplando."""
    for s in (-1, 1):
        cx = s * OJOS_X
        linea(d, [(cx + 0.024 * math.cos(math.radians(a)), OJOS_Z - 0.006 + 0.020 * math.sin(math.radians(a))) for a in range(180, -1, -15)], 0.012)
    cx, cy = a_px(0.0, 0.732); r = m_px(0.014); g = m_px(0.009)
    d.ellipse((cx - r, cy - r, cx + r, cy + r), outline=TRAZO, width=round(g))

def furia(d):
    """Furioso: cejas en V muy cerradas, ojos en zigzag y boca de dientes apretados."""
    for s in (-1, 1):
        cx = s * OJOS_X
        linea(d, [(cx + s * 0.034, 0.842), (cx - s * 0.026, 0.808)], 0.017)
        linea(d, [(cx - 0.022, 0.794), (cx - 0.011, 0.774), (cx, 0.794), (cx + 0.011, 0.774), (cx + 0.022, 0.794)], 0.010)
    linea(d, [(-0.04, 0.716), (-0.04, 0.738), (0.04, 0.738), (0.04, 0.716), (-0.04, 0.716)], 0.008)
    for x in (-0.02, 0.0, 0.02):
        linea(d, [(x, 0.716), (x, 0.738)], 0.006)

def satisfecho(d):
    """Satisfecho y orgulloso: ojos cerrados contentos (^ ^) y sonrisa ancha."""
    for s in (-1, 1):
        cx = s * OJOS_X
        linea(d, [(cx + 0.024 * math.cos(math.radians(a)), OJOS_Z - 0.006 + 0.020 * math.sin(math.radians(a))) for a in range(180, -1, -15)], 0.012)
    linea(d, [(0.040 * math.cos(math.radians(a)), 0.744 - 0.024 * math.sin(math.radians(a))) for a in range(180, -1, -15)], 0.012)

CARAS = {
    'furia': furia,
    'satisfecho': satisfecho,
    'golpe': golpe,
    'flauta': flauta,
    'molesto': molesto,
    'preocupado': preocupado,
    **{f'engranaje-{i}': engranaje(i * 15) for i in range(3)},
    **{f'carga-{i}': carga(i) for i in (1, 2, 3)},
    'pregunta': pregunta,
    'binario-a': binario('0', '1'),
    'binario-b': binario('1', '0'),
    'espiral': espiral,
    **{f'estatica-{i}': estatica(i) for i in range(3)},
}

if __name__ == '__main__':
    destino = Path(sys.argv[1]); destino.mkdir(parents=True, exist_ok=True)
    tam = (round(ANCHO_M * PX_POR_M), round(ALTO_M * PX_POR_M))
    for nombre, dibujar in CARAS.items():
        img = Image.new('RGB', (tam[0] * ESCALA, tam[1] * ESCALA), FONDO)
        dibujar(ImageDraw.Draw(img))
        img.resize(tam, Image.LANCZOS).save(destino / f'{nombre}.png')
        print('Cara', nombre)
