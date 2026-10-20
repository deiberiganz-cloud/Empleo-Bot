"""Recorta las poses del robot de las hojas de Gemini: saca el verde, separa cada pose,
las deja a la misma escala, con los pies en la misma línea, y las guarda en WebP transparente."""
import sys
from collections import deque
from pathlib import Path

import numpy as np
from PIL import Image

ESCRITORIO = Path(r"C:\Users\Admin\Desktop")
HOJAS = [
    (ESCRITORIO / "Cartoon_robot_character_sheet_poses_2K_20261020170331.jpg",
     ["parado", "paso-a", "paso-b", "caja-paso-0", "salto", "preocupado"]),
    (ESCRITORIO / "los_dedos_no_se_distinguen_2K_20261020165311.jpg_2K_20261020165902.jpg_2K_20261020171034.jpg",
     ["caja-paso-1", "caja-paso-2", "tablet", "tablet-concentrado", "parado-caja"]),
]
SALIDA = Path(sys.argv[1])
ESCALA = 0.4  # 2K → poses de ~400 px de alto (se muestran a ~80 px: queda nítido en pantallas 2x)
REDUCCION = 4  # para encontrar las piezas rápido


def alfa_y_color(rgb):
    r, g, b = [rgb[..., i].astype(np.int32) for i in range(3)]
    verdor = g - np.maximum(r, b)
    # verdor alto = fondo; bajo = robot. Entre medio, borde semitransparente.
    alfa = np.clip((90 - verdor) / 50, 0, 1)
    # Quitar el reflejo verde de los bordes (despill): el verde no puede pasar al mayor de rojo/azul.
    g2 = np.minimum(g, np.maximum(r, b) + 10)
    limpio = np.stack([r, g2, b], axis=-1).clip(0, 255).astype(np.uint8)
    return alfa, limpio


def piezas(mascara):
    """Componentes conexas (4 vecinos) de una máscara chica. Devuelve la imagen de etiquetas."""
    alto, ancho = mascara.shape
    etiquetas = np.zeros((alto, ancho), np.int32)
    actual = 0
    for y in range(alto):
        for x in range(ancho):
            if mascara[y, x] and not etiquetas[y, x]:
                actual += 1
                cola = deque([(y, x)])
                etiquetas[y, x] = actual
                while cola:
                    cy, cx = cola.popleft()
                    for ny, nx in ((cy + 1, cx), (cy - 1, cx), (cy, cx + 1), (cy, cx - 1)):
                        if 0 <= ny < alto and 0 <= nx < ancho and mascara[ny, nx] and not etiquetas[ny, nx]:
                            etiquetas[ny, nx] = actual
                            cola.append((ny, nx))
    return etiquetas, actual


def costura(mascara, desde, hasta):
    """Camino vertical de arriba abajo, entre las columnas desde y hasta, que cruza la menor
    cantidad de dibujo (como el "seam carving"): separa dos poses que se tocan."""
    alto = mascara.shape[0]
    costo = mascara[:, desde:hasta].astype(np.float64) * 100 + 1
    acumulado = costo.copy()
    for y in range(1, alto):
        previo = acumulado[y - 1]
        izq = np.concatenate([[np.inf], previo[:-1]])
        der = np.concatenate([previo[1:], [np.inf]])
        acumulado[y] += np.minimum(np.minimum(izq, previo), der)
    camino = np.zeros(alto, np.int32)
    camino[-1] = int(np.argmin(acumulado[-1]))
    for y in range(alto - 2, -1, -1):
        x = camino[y + 1]
        candidatos = [c for c in (x - 1, x, x + 1) if 0 <= c < costo.shape[1]]
        camino[y] = min(candidatos, key=lambda c: acumulado[y, c])
    return camino + desde


CENTROS = {
    "Cartoon": [190, 520, 850, 1160, 1480, 1800],
    "los_dedos": [250, 650, 1040, 1420, 1780],
}

poses = {}
for ruta, nombres in HOJAS:
    imagen = Image.open(ruta).convert("RGB")
    rgb = np.asarray(imagen)
    alfa, limpio = alfa_y_color(rgb)
    # Los bordes de la imagen (y la marca de agua de abajo a la derecha) nunca son robot.
    alfa[-90:, :] = 0
    alfa[:, -15:] = 0
    alfa[:15, :] = 0
    alfa[:, :15] = 0
    chica = alfa[::REDUCCION, ::REDUCCION] > 0.3
    # Los centros se midieron sobre una vista de 2000 px de ancho: se pasan al tamaño real.
    factor = rgb.shape[1] / 2000
    centros = [int(c * factor) // REDUCCION for c in next(v for k, v in CENTROS.items() if ruta.name.startswith(k))]
    costuras = [costura(chica, a + 20, b - 20) for a, b in zip(centros, centros[1:])]
    columnas = np.arange(chica.shape[1])
    indice_chico = sum((columnas[None, :] > c[:, None]).astype(np.int32) for c in costuras)
    indice = np.kron(indice_chico, np.ones((REDUCCION, REDUCCION), np.int32))[: rgb.shape[0], : rgb.shape[1]]
    for n, nombre in enumerate(nombres):
        propia_chica = (indice_chico == n) & chica
        etiquetas, total = piezas(propia_chica)
        areas = np.bincount(etiquetas.ravel())
        mayor = int(np.argmax(areas[1:]) + 1)
        borde = np.zeros_like(propia_chica)
        for c in costuras:
            for y, x in enumerate(c):
                borde[y, max(0, x - 2): x + 3] = True
        fondo_mayor = np.nonzero((etiquetas == mayor).any(axis=1))[0].max()
        # Se quitan: pedazos del vecino (tocan la costura) y lo que está debajo de los pies
        # (la marca de agua de Gemini en la esquina de abajo).
        quitar = [i for i in range(1, total + 1) if i != mayor and (
            (etiquetas == i)[borde].any() or np.nonzero((etiquetas == i).any(axis=1))[0].min() > fondo_mayor - 2)]
        limpia = np.isin(etiquetas, quitar)
        limpia = np.kron(limpia, np.ones((REDUCCION, REDUCCION), bool))[: rgb.shape[0], : rgb.shape[1]]
        a = np.where((indice == n) & ~limpia, alfa, 0)
        ys, xs = np.nonzero(a > 0.05)
        y0, y1, x0, x1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
        rgba = np.dstack([limpio[y0:y1, x0:x1], (a[y0:y1, x0:x1] * 255).astype(np.uint8)])
        # Ancla: el centro de la cabeza (la franja de filas debajo del tope) y el piso.
        sub = a[y0:y1, x0:x1] > 0.5
        filas = np.nonzero(sub.sum(axis=1) > 40)[0]
        tope = filas.min()
        cabeza = sub[tope + 80: tope + 360]
        cx = np.nonzero(cabeza.any(axis=0))[0].mean()
        casco = np.nonzero(cabeza.any(axis=0))[0]
        poses[nombre] = dict(rgba=rgba, cx=cx + x0, piso=y1, x0=x0, y0=y0, hoja=ruta.name, casco=casco.max() - casco.min())
        print(nombre, "caja", (x0, y0, x1, y1))

# Las dos hojas no salieron del mismo tamaño: se igualan por el ancho del casco (mediana de cada hoja).
cascos = {}
for p in poses.values():
    cascos.setdefault(p["hoja"], []).append(p["casco"])
referencia = float(np.median(cascos[HOJAS[0][0].name]))
for p in poses.values():
    f = referencia / float(np.median(cascos[p["hoja"]]))
    if abs(f - 1) > 0.01:
        alto0, ancho0 = p["rgba"].shape[:2]
        im = Image.fromarray(p["rgba"], "RGBA").resize((round(ancho0 * f), round(alto0 * f)), Image.LANCZOS)
        p["rgba"] = np.asarray(im)
        for k in ("cx", "piso", "x0", "y0"):
            p[k] = p[k] * f
    print(p["hoja"][:12], "factor", round(f, 3), "piso", int(p["piso"]))

# El piso de cada hoja: el más bajo de las poses paradas (la de salto queda más arriba a propósito).
pisos = {}
for p in poses.values():
    pisos[p["hoja"]] = max(pisos.get(p["hoja"], 0), p["piso"])

# Lienzo común: cuánto ocupa cada pose a la izquierda/derecha del ancla y arriba del piso.
izq = max(p["cx"] - p["x0"] for p in poses.values())
der = max(p["x0"] + p["rgba"].shape[1] - p["cx"] for p in poses.values())
arriba = max(pisos[p["hoja"]] - p["y0"] for p in poses.values())
ancho, alto = int(izq + der), int(arriba)
SALIDA.mkdir(parents=True, exist_ok=True)
for nombre, p in poses.items():
    lienzo = Image.new("RGBA", (ancho, alto), (0, 0, 0, 0))
    x = int(izq - (p["cx"] - p["x0"]))
    y = int(arriba - (pisos[p["hoja"]] - p["y0"]))
    lienzo.alpha_composite(Image.fromarray(p["rgba"], "RGBA"), (x, y))
    final = lienzo.resize((int(ancho * ESCALA), int(alto * ESCALA)), Image.LANCZOS)
    final.save(SALIDA / f"{nombre}.webp", "WEBP", quality=88, method=6)
    print(f"{nombre}.webp", final.size, (SALIDA / f"{nombre}.webp").stat().st_size // 1024, "KB")
