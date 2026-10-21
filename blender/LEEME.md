# Robot del postulador en 3D

El robot que camina por el encabezado de la app sale de un modelo 3D generado con IA a partir de una
ficha de 5 vistas. Todo el proceso es con scripts de Blender (sin abrir la ventana), en este orden:

| Paso | Script | Qué hace |
|---|---|---|
| 1 | `limpiar-robot.py` | Deja liviano el `.glb` del generador (1,5 M triángulos → unos 50 mil). |
| 1b | `hornear-robot.py` | Mapa UV nuevo y "horneado" de color, rugosidad y relieve del original. |
| 2b | `recolorear-robot.py` | Corre los colores de la textura hacia los de la ficha. |
| 3 | `esqueleto-robot.py` | 23 huesos con articulaciones tipo bisagra: corta la malla en piezas por las costuras. |
| 4 | `dibujar-caras.py` | Dibuja las caras extra de la pantalla (la sonriente viene en el modelo). |
| 4 | `animar-robot.py` | Arma cada pose por código y renderiza los 24 cuadros en 3/4. |
| 5 | `sprites-a-webp.py` | Pasa los cuadros a WebP en `web/public/robot/`. |

`crear-robot.py` es la primera versión (el robot armado con piezas simples) y `para-mixamo.py`, el intento
de usar el auto-rig de Mixamo, que rechazó el archivo; quedan como registro.

Los modelos (`modelo/`), las fotos de control (`control/`) y la ficha no se suben: pesan cientos de MB.

```sh
blender -b modelo/robot-horneado.blend -P esqueleto-robot.py -- modelo/robot-con-esqueleto.blend modelo/robot_color_ficha.png
python dibujar-caras.py caras
blender -b modelo/robot-con-esqueleto.blend -P animar-robot.py -- control/anim
python sprites-a-webp.py control/anim ../web/public/robot
```
