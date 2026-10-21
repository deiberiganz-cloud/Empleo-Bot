# Paso 1b: reducir estira la textura (los bordes de la cara salen serruchados).
# Arreglo: el liviano recibe un mapa UV nuevo y se le "hornean" color, rugosidad y relieve del original.
# Uso: blender -b --factory-startup -P hornear-robot.py -- <original.glb> <salida-sin-extension> <triangulos> [lado=2048]
import bpy, sys

entrada, salida, objetivo, *resto = sys.argv[sys.argv.index('--') + 1:]
lado = int(resto[0]) if resto else 2048

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=entrada)
alto = next(o for o in bpy.context.scene.objects if o.type == 'MESH')
alto.name = 'original'

# Copia liviana
bajo = alto.copy()
bajo.data = alto.data.copy()
bajo.name = bajo.data.name = 'robot'
bpy.context.scene.collection.objects.link(bajo)
bpy.ops.object.select_all(action='DESELECT')
bpy.context.view_layer.objects.active = bajo
bajo.select_set(True)
reducir = bajo.modifiers.new('reducir', 'DECIMATE')
reducir.ratio = 300000 / len(bajo.data.polygons)
bpy.ops.object.modifier_apply(modifier='reducir')
# Los vóxeles rehacen la superficie pareja y cerrada (3 mm alcanza para orejas y dedos);
# sin esto, al reducir queda tan irregular que el mapa UV se parte en miles de pedacitos
bajo.data.remesh_voxel_size = 0.003
bpy.ops.object.voxel_remesh()
reducir = bajo.modifiers.new('reducir', 'DECIMATE')
reducir.ratio = int(objetivo) / len(bajo.data.polygons)
bpy.ops.object.modifier_apply(modifier='reducir')
bpy.ops.object.shade_smooth()
print('TRIANGULOS', len(bajo.data.polygons))

# Mapa UV nuevo, sin estiramientos
uv = bajo.data.uv_layers
while len(uv) > 1:
    uv.remove(uv[-1])
uv[0].name = 'UVMap'
bpy.ops.object.mode_set(mode='EDIT')
bpy.ops.mesh.select_all(action='SELECT')
bpy.ops.uv.smart_project(angle_limit=1.15, island_margin=0.003)
bpy.ops.object.mode_set(mode='OBJECT')

# Material nuevo con imágenes vacías donde se hornea
mat = bpy.data.materials.new('robot')
mat.use_nodes = True
nodos, enlaces = mat.node_tree.nodes, mat.node_tree.links
bsdf = nodos['Principled BSDF']
bsdf.inputs['Metallic'].default_value = 0.0
bajo.data.materials.clear()
bajo.data.materials.append(mat)

def imagen(nombre, datos):
    img = bpy.data.images.new(nombre, lado, lado, alpha=False)
    if datos:
        img.colorspace_settings.name = 'Non-Color'
    nodo = nodos.new('ShaderNodeTexImage')
    nodo.image = img
    return img, nodo

sc = bpy.context.scene
sc.render.engine = 'CYCLES'
sc.cycles.samples = 4
sc.render.bake.use_selected_to_active = True
sc.render.bake.cage_extrusion = 0.01
sc.render.bake.max_ray_distance = 0.03
sc.render.bake.margin = 8

bpy.ops.object.select_all(action='DESELECT')
alto.select_set(True)
bajo.select_set(True)
bpy.context.view_layer.objects.active = bajo

hechas = {}
for nombre, tipo, datos in [('color', 'DIFFUSE', False), ('rugosidad', 'ROUGHNESS', True), ('relieve', 'NORMAL', True)]:
    img, nodo = imagen('robot_' + nombre, datos)
    nodos.active = nodo
    if tipo == 'DIFFUSE':
        sc.render.bake.use_pass_direct = sc.render.bake.use_pass_indirect = False
        sc.render.bake.use_pass_color = True
    bpy.ops.object.bake(type=tipo)
    img.pack()
    hechas[nombre] = nodo
    print('HORNEADO', nombre)

enlaces.new(hechas['color'].outputs['Color'], bsdf.inputs['Base Color'])
enlaces.new(hechas['rugosidad'].outputs['Color'], bsdf.inputs['Roughness'])
mapa = nodos.new('ShaderNodeNormalMap')
enlaces.new(hechas['relieve'].outputs['Color'], mapa.inputs['Color'])
enlaces.new(mapa.outputs['Normal'], bsdf.inputs['Normal'])

bpy.data.objects.remove(alto)
bpy.ops.outliner.orphans_purge(do_recursive=True)
bpy.ops.wm.save_as_mainfile(filepath=salida + '.blend', compress=True)
bpy.ops.export_scene.gltf(filepath=salida + '.glb', export_format='GLB',
                          export_image_format='WEBP', export_image_quality=85)
