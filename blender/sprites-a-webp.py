# Paso 5: pasa los cuadros PNG que deja animar-robot.py a WebP para la app (web/public/robot/).
# Uso: python sprites-a-webp.py <carpeta con los PNG> ../web/public/robot
import sys
from pathlib import Path
from PIL import Image

origen, destino = Path(sys.argv[1]), Path(sys.argv[2])
destino.mkdir(parents=True, exist_ok=True)
for png in sorted(origen.glob('*.png')):
    Image.open(png).convert('RGBA').save(destino / f'{png.stem}.webp', 'WEBP', quality=88, method=6)
    print(png.stem)
