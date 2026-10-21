# Paso 1 del robot 3D: deja liviano el .glb que salió del generador.
# Uso: blender -b --factory-startup -P limpiar-robot.py -- <entrada.glb> <salida-sin-extension> <triangulos> [lado_textura=1024]
# Sale <salida>.blend y <salida>.glb (texturas en WebP de 1024 px).
import bpy, sys

entrada, salida, objetivo, *resto = sys.argv[sys.argv.index("--") + 1:]
lado = int(resto[0]) if resto else 1024
objetivo = int(objetivo)

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=entrada)
robot = next(o for o in bpy.context.scene.objects if o.type == 'MESH')
robot.name = robot.data.name = 'robot'
bpy.context.view_layer.objects.active = robot
robot.select_set(True)

# Los generadores dejan vértices repetidos en las costuras: se juntan antes de reducir
bpy.ops.object.mode_set(mode='EDIT')
bpy.ops.mesh.select_all(action='SELECT')
bpy.ops.mesh.remove_doubles(threshold=0.00005)
bpy.ops.object.mode_set(mode='OBJECT')

antes = sum(len(p.vertices) - 2 for p in robot.data.polygons)
reducir = robot.modifiers.new('reducir', 'DECIMATE')
reducir.ratio = objetivo / antes
reducir.use_collapse_triangulate = True
bpy.ops.object.modifier_apply(modifier='reducir')
bpy.ops.object.shade_smooth()
despues = sum(len(p.vertices) - 2 for p in robot.data.polygons)
print(f'TRIANGULOS {antes} -> {despues}')

# Texturas a 1024: el detalle fino ya está pintado, no hace falta 4K para 90 px de alto
for img in bpy.data.images:
    print('TEXTURA', img.name, tuple(img.size))
    if max(img.size) > lado:
        img.scale(lado, lado)
    img.pack()

bpy.ops.wm.save_as_mainfile(filepath=salida + '.blend')
bpy.ops.export_scene.gltf(filepath=salida + '.glb', export_format='GLB',
                          export_image_format='WEBP', export_image_quality=85)
