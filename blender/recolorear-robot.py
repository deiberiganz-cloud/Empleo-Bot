# Paso 2b: corrige los colores de la textura para que coincidan con la ficha de Gemini (ficha.jpg).
# La página que generó el 3D dejó el blanco grisáceo y el azul tirando a violeta (los oscuros salieron bien).
# Cada color "de origen" de la textura se corre hacia su color de la ficha; los píxeles intermedios se corren
# en proporción a su parecido con cada uno,
# así se conservan los garabatos del patrón, los bordes y el sombreado.
# Uso: python recolorear-robot.py modelo/robot_color.png modelo/robot_color_ficha.png
import sys
import numpy as np
from PIL import Image

hex2 = lambda h: np.array([int(h[i:i + 2], 16) for i in (1, 3, 5)], float)

PARES = [  # (color en la textura, color en la ficha)
    ('#d6d3e0', '#f4f3fa'),  # blanco del cuerpo y el casco
    ('#adacc2', '#cfced8'),  # sombras del blanco
    ('#7080b1', '#85a5cf'),  # azul del patrón
    # los oscuros ya coinciden con la ficha: quedan fijos (corrérselos los volvía verdosos)
    ('#5b5b82', '#5b5b82'),  # gris azulado (mecánica, sombras del patrón)
    ('#3c314e', '#3c314e'),  # gris oscuro de brazos y rodillas
    ('#190e3e', '#190e3e'),  # azul marino de contornos y guantes
    ('#110a23', '#110a23'),  # casi negro (pantalla)
    ('#b30727', '#b30727'),  # rojo de la corbata: queda igual
    ('#000000', '#000000'),  # fondo vacío del mapa
]
SIGMA = 28.0  # qué tan lejos llega la influencia de cada par (en valores RGB 0-255)

def recolorear(entrada, salida):
    img = Image.open(entrada).convert('RGB')
    px = np.asarray(img).astype(np.float32).reshape(-1, 3)
    origen = np.array([hex2(a) for a, _ in PARES], np.float32)
    destino = np.array([hex2(b) for _, b in PARES], np.float32)
    resultado = np.empty_like(px)
    for i in range(0, len(px), 1 << 20):  # por bloques para no llenar la memoria
        b = px[i:i + (1 << 20)]
        d2 = ((b[:, None, :] - origen[None]) ** 2).sum(2)
        w = np.exp(-(d2 - d2.min(1, keepdims=True)) / (2 * SIGMA ** 2))
        w /= w.sum(1, keepdims=True)
        resultado[i:i + len(b)] = b + w @ (destino - origen)
    out = np.clip(resultado, 0, 255).astype(np.uint8).reshape(img.size[1], img.size[0], 3)
    Image.fromarray(out).save(salida)
    print('Textura recoloreada:', salida)

if __name__ == '__main__':
    recolorear(sys.argv[1], sys.argv[2])
