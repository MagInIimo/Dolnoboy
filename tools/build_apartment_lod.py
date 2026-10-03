import bpy
import math
import json
import random
import struct
import hashlib
from pathlib import Path
from mathutils import Vector

BASE = Path(__file__).resolve().parents[1]
OUTPUT = BASE/'game/assets/models/apartment-lod.glb'
TEMP = BASE/'tmp/assets/apartment-lod-clean.glb'
STATS = BASE/'tmp/qa/apartment-lod-stats.json'
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.unit_settings.system = 'METRIC'
scene.unit_settings.scale_length = 1

def to_b(p):
    return Vector((p[0], -p[2], p[1]))

def to_g(p):
    return (p[0], p[2], -p[1])

recipes = {
    'facade': ((.62, .565, .447), .9, 0, 0),
    'trim': ((.45, .428, .367), .86, 0, 0),
    'concrete': ((.30, .306, .285), .96, 0, 0),
    'recess': ((.065, .072, .068), 1, 0, 0),
    'frame': ((.36, .385, .347), .63, 0, 0),
    'glass': ((.095, .145, .162), .14, 0, .7),
    'metal': ((.40, .435, .419), .62, 1, 0),
    'roof': ((.135, .159, .148), .72, 0, 0),
}
materials = {}
for tag, (color, rough, metal, coat) in recipes.items():
    mat = bpy.data.materials.new('MAT-'+tag)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes['Principled BSDF']
    bsdf.inputs['Base Color'].default_value = (*color, 1)
    bsdf.inputs['Roughness'].default_value = rough
    bsdf.inputs['Metallic'].default_value = metal
    bsdf.inputs['Coat Weight'].default_value = coat
    bsdf.inputs['Coat Roughness'].default_value = .14
    mat.diffuse_color = (*color, 1)
    materials[tag] = mat
vertex_color = materials['glass'].node_tree.nodes.new('ShaderNodeVertexColor')
vertex_color.layer_name = 'Color'
materials['glass'].node_tree.links.new(vertex_color.outputs['Color'], materials['glass'].node_tree.nodes['Principled BSDF'].inputs['Base Color'])
surfaces = {tag: {'points': [], 'faces': [], 'colors': []} for tag in recipes}

def add(tag, points, faces, color=(1, 1, 1, 1)):
    surface = surfaces[tag]
    offset = len(surface['points'])
    surface['points'].extend(points)
    surface['faces'].extend(tuple(offset+i for i in face) for face in faces)
    surface['colors'].extend([color]*len(faces))

def quad(tag, points, color=(1, 1, 1, 1)):
    add(tag, points, [(0, 1, 2, 3)], color)

def box(tag, pos, size, transform=None, visible=None):
    x, y, z = pos
    a, b, c = [v/2 for v in size]
    points = [(x-a, y-b, z-c), (x+a, y-b, z-c), (x+a, y+b, z-c), (x-a, y+b, z-c),
              (x-a, y-b, z+c), (x+a, y-b, z+c), (x+a, y+b, z+c), (x-a, y+b, z+c)]
    faces = [(0, 3, 2, 1), (4, 5, 6, 7), (0, 1, 5, 4), (3, 7, 6, 2), (0, 4, 7, 3), (1, 2, 6, 5)]
    if visible is not None:
        faces = [faces[i] for i in visible]
    add(tag, [transform(*p) for p in points] if transform else points, faces)

def face_transform(yaw, depth):
    co, si = math.cos(yaw), math.sin(yaw)
    return lambda u, y, out: (u*co+(depth+out)*si, y, -u*si+(depth+out)*co)

def rect(tag, transform, x0, x1, y0, y1, out=0, color=(1, 1, 1, 1)):
    if x1-x0 <= .000001 or y1-y0 <= .000001:
        return
    quad(tag, [transform(x0, y0, out), transform(x1, y0, out), transform(x1, y1, out), transform(x0, y1, out)], color)

def fill_panel(tag, transform, x0, x1, y0, y1, holes):
    clipped = [(max(x0, a), min(x1, b), max(y0, c), min(y1, d)) for a, b, c, d in holes
               if a < x1 and b > x0 and c < y1 and d > y0]
    if not clipped:
        rect(tag, transform, x0, x1, y0, y1)
        return
    xs = sorted(set([x0, x1]+[x for hole in clipped for x in hole[:2]]))
    ys = sorted(set([y0, y1]+[y for hole in clipped for y in hole[2:]]))
    for a, b in zip(xs, xs[1:]):
        for c, d in zip(ys, ys[1:]):
            if not any(e < (a+b)/2 < f and g < (c+d)/2 < h for e, f, g, h in clipped):
                rect(tag, transform, a, b, c, d)

def flat_frame(transform, u, bottom, width, height, out=-.17, tag='frame', border=.06):
    x0, x1, y0, y1 = u-width/2, u+width/2, bottom, bottom+height
    rect(tag, transform, x0, x0+border, y0, y1, out)
    rect(tag, transform, x1-border, x1, y0, y1, out)
    rect(tag, transform, x0+border, x1-border, y0, y0+border, out)
    rect(tag, transform, x0+border, x1-border, y1-border, y1, out)

def jambs(transform, u, bottom, width, height):
    x0, x1, y0, y1 = u-width/2, u+width/2, bottom, bottom+height
    outer = [transform(x0, y0, 0), transform(x1, y0, 0), transform(x1, y1, 0), transform(x0, y1, 0)]
    inner = [transform(x0, y0, -.28), transform(x1, y0, -.28), transform(x1, y1, -.28), transform(x0, y1, -.28)]
    add('trim', outer+inner, [(i, (i+1)%4, (i+1)%4+4, i+4) for i in range(4)])

def sill(transform, u, bottom, width):
    x0, x1, top, low, back, front = u-(width+.22)/2, u+(width+.22)/2, bottom+.032, bottom-.060, -.12, .278
    quad('trim', [transform(x0, top, back), transform(x0, top, front), transform(x1, top, front), transform(x1, top, back)])
    rect('trim', transform, x0, x1, low, top, front)
    quad('trim', [transform(x0, low, back), transform(x0, low, front), transform(x0, top, front), transform(x0, top, back)])
    quad('trim', [transform(x1, low, front), transform(x1, low, back), transform(x1, top, back), transform(x1, top, front)])

window_count, balcony_count = 0, 0
for side, yaw, width, depth, columns in [(0, 0, 25, 18, 6), (1, math.pi, 25, 18, 6), (2, math.pi/2, 18, 25, 4), (3, -math.pi/2, 18, 25, 4)]:
    transform = face_transform(yaw, depth/2)
    centres = [(i-(columns-1)/2)*(width-1.48)/columns for i in range(columns)]
    edges = [-width/2]+[(a+b)/2 for a, b in zip(centres, centres[1:])]+[width/2]
    for floor in range(6):
        row_low, row_high = (0, 3.51) if floor == 0 else (3.51+(floor-1)*3.0, 3.51+floor*3.0)
        if floor == 5:
            row_high = 18.6
        tag = 'trim' if floor == 0 else 'facade'
        holes = [(-1.02, 1.02, .18, 2.83)] if side < 2 and floor == 0 else []
        for col, u in enumerate(centres):
            bottom, w, h = (1.05, 1.72, 2.24) if floor == 0 else (3.77+(floor-1)*3.0, 1.56, 2.04)
            is_balcony = floor > 0 and side < 2 and col % 3 == 1
            if is_balcony:
                bottom -= .08
                h += .08
            x0, x1, top = u-w/2, u+w/2, bottom+h
            for bounds in [(edges[col], x0, row_low, row_high), (x1, edges[col+1], row_low, row_high),
                           (x0, x1, row_low, bottom), (x0, x1, top, row_high)]:
                fill_panel(tag, transform, *bounds, holes)
            jambs(transform, u, bottom, w, h)
            flat_frame(transform, u, bottom+.035, w-.07, h-.07)
            rect('frame', transform, u-w*.085-.023, u-w*.085+.023, bottom+.095, top-.095, -.16)
            rect('frame', transform, u-w/2+.095, u+w/2-.095, bottom+h*.72-.022, bottom+h*.72+.022, -.159)
            rand = random.Random(8191+floor*149+col*19+side*641)
            color = (.09+rand.random()*.024, .135+rand.random()*.026, .153+rand.random()*.031, 1)
            rect('glass', transform, x0, x1, bottom, top, -.285, color)
            sill(transform, u, bottom, w)
            window_count += 1
            if is_balcony:
                balcony_count += 1
                by = bottom-.06
                box('concrete', (u, by-.08, .5375), (2.46, .16, 1.205), transform)
                box('concrete', (u, by+.22, 1.095), (2.34, .36, .075), transform, (1, 3, 4, 5))
                rect('metal', transform, u-1.215, u+1.215, by+.92, by+.96, 1.09)
                for dx in (-1.15, 0, 1.15):
                    rect('metal', transform, u+dx-.014, u+dx+.014, by+.40, by+.94, 1.09)
                for sign in (-1, 1):
                    x = u+sign*1.19
                    points = [transform(x, by+.92, .02), transform(x, by+.92, 1.10),
                              transform(x, by+.96, 1.10), transform(x, by+.96, .02)]
                    quad('metal', list(reversed(points)) if sign > 0 else points)
                    rect('metal', transform, x-.014, x+.014, by+.40, by+.94, .02)
    plinth_segments = [(-width/2, -1.02), (1.02, width/2)] if side < 2 else [(-width/2, width/2)]
    for a, b in plinth_segments:
        rect('concrete', transform, a, b, 0, .73, .012)
    for y, projection, high in [(3.49, .075, .12), (3.60, .10, .065), (18.49, .225, .22), (18.70, .285, .135)]:
        rect('trim', transform, -width/2-projection, width/2+projection, y-high/2, y+high/2, projection)
    if side < 2:
        jambs(transform, 0, .18, 2.04, 2.65)
        flat_frame(transform, 0, .21, 2.0, 2.59, -.20, 'roof', .085)
        rect('glass', transform, -.91, .91, .30, 2.71, -.287, (.082, .13, .151, 1))
        rect('roof', transform, -.029, .029, .29, 2.72, -.18)
        rect('roof', transform, -.91, .91, 2.37, 2.43, -.179)
        rect('recess', transform, -.91, .91, .30, 1.17, -.17)
        box('roof', (0, 2.985, .59), (3.26, .034, 1.46), transform)
        box('concrete', (0, .09, .43), (2.35, .18, 1.2), transform)

eave, ridge, roof_x, roof_z, ridge_x = 18.95, 20.08, 12.87, 9.34, 6.8
points = [(-roof_x, eave, roof_z), (roof_x, eave, roof_z), (roof_x, eave, -roof_z),
          (-roof_x, eave, -roof_z), (-ridge_x, ridge, 0), (ridge_x, ridge, 0)]
add('roof', points, [(0, 1, 5, 4), (2, 3, 4, 5), (1, 2, 5), (3, 0, 4)])
box('metal', (0, ridge+.015, 0), (ridge_x*2, .03, .067))
for x, z in ((-7.1, 2.3), (7.1, 2.3), (-7.1, -3.2), (7.1, -3.2)):
    y = ridge-(ridge-eave)*max(abs(z)/roof_z, max(0, (abs(x)-ridge_x)/(roof_x-ridge_x)))
    box('trim', (x, y+.56, z), (1.0, 1.13, .72))
    box('roof', (x, y+1.21, z), (1.32, .055, .98))
    rect('recess', face_transform(0, z+.361), x-.38, x+.38, y+.85, y+1.02)
box('metal', (-4.6, (20.05+21.87)/2, -.7), (.038, 21.87-20.05, .038))
box('metal', (-4.6, 21.39, -.7), (1.46, .027, .027))

objects, parts = [], []
for tag, surface in surfaces.items():
    data = bpy.data.meshes.new('MESH-'+tag)
    data.from_pydata([to_b(p) for p in surface['points']], [], surface['faces'])
    data.update()
    uv = data.uv_layers.new(name='UVMap')
    color = data.color_attributes.new(name='Color', type='FLOAT_COLOR', domain='CORNER')
    for face, rgba in zip(data.polygons, surface['colors']):
        normal = to_g(face.normal)
        axis = max(range(3), key=lambda i: abs(normal[i]))
        for loop in face.loop_indices:
            p = surface['points'][data.loops[loop].vertex_index]
            coord = (p[0], p[2]) if axis == 1 else ((p[2], p[1]) if axis == 0 else (p[0], p[1]))
            uv.data[loop].uv = (coord[0]/3.0, coord[1]/3.0)
            color.data[loop].color = rgba
    data.color_attributes.active_color = color
    assert not data.validate(verbose=False, clean_customdata=True), tag
    data.calc_loop_triangles()
    obj = bpy.data.objects.new('GEO-'+tag, data)
    scene.collection.objects.link(obj)
    data.materials.append(materials[tag])
    objects.append(obj)
    parts.append({'tag': tag, 'triangles': len(data.loop_triangles)})
triangles = sum(p['triangles'] for p in parts)
assert triangles <= 6000, triangles
assert window_count == 120 and balcony_count == 20
assert len(objects) == 8
source_points = [to_g(v.co) for obj in objects for v in obj.data.vertices]
minimum = [min(p[i] for p in source_points) for i in range(3)]
maximum = [max(p[i] for p in source_points) for i in range(3)]
expected_min, expected_max = [-12.869999885559082, 0, -10.319999694824219], [12.869999885559082, 21.8700008392334, 10.319999694824219]
assert minimum == expected_min and maximum == expected_max, (minimum, maximum)
TEMP.parent.mkdir(parents=True, exist_ok=True)
for obj in objects:
    obj.select_set(True)
bpy.context.view_layer.objects.active = objects[0]
bpy.ops.export_scene.gltf(filepath=str(TEMP), export_format='GLB', use_selection=True,
                          export_apply=True, export_yup=True, export_materials='EXPORT',
                          export_animations=False, export_skins=False, export_morph=False,
                          export_normals=True, export_texcoords=True, export_tangents=False,
                          export_cameras=False, export_lights=False, export_extras=False)
blob = TEMP.read_bytes()
json_length = struct.unpack_from('<I', blob, 12)[0]
gltf = json.loads(blob[20:20+json_length])
gltf['asset']['generator'] = 'glTF 2.0'
encoded = json.dumps(gltf, separators=(',', ':'), ensure_ascii=True).encode('utf8')
encoded += b' ' * ((-len(encoded)) % 4)
tail = blob[20+json_length:]
TEMP.write_bytes(struct.pack('<III', 0x46546C67, 2, 20+len(encoded)+len(tail))
                 + struct.pack('<II', len(encoded), 0x4E4F534A) + encoded + tail)
assert not gltf.get('images')
assert sum(len(m['primitives']) for m in gltf['meshes']) == 8
exported_triangles = sum(gltf['accessors'][p['indices']]['count']//3 for m in gltf['meshes'] for p in m['primitives'])
assert exported_triangles == triangles
TEMP.replace(OUTPUT)
stats = {'path': str(OUTPUT), 'strategy': 'Independent axis-aligned facade openings and straight frames',
         'bytes': OUTPUT.stat().st_size, 'sha256': hashlib.sha256(OUTPUT.read_bytes()).hexdigest(),
         'triangles': triangles, 'drawcalls': 8, 'bbox_min': minimum, 'bbox_max': maximum,
         'bounds_delta_max_m': 0, 'window_count': window_count, 'balcony_count': balcony_count,
         'embedded_images': 0, 'parts': parts, 'materials': [m['name'] for m in gltf['materials']]}
STATS.write_text(json.dumps(stats, indent=2), encoding='utf8')
print('APARTMENT_LOD_STATS='+json.dumps(stats), flush=True)
