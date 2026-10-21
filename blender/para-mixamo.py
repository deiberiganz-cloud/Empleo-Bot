# Paso 2: exporta el robot horneado a FBX con las texturas adentro, listo para subir a mixamo.com
# Uso: blender -b <robot-horneado.blend> -P para-mixamo.py -- <salida.fbx>
import bpy, sys
salida = sys.argv[sys.argv.index('--') + 1]
bpy.ops.export_scene.fbx(filepath=salida, use_selection=False, object_types={'MESH'},
                         apply_unit_scale=True, path_mode='COPY', embed_textures=True)
