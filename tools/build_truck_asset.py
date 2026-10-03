import bpy
import bmesh
import math
import json
import os
import struct
import hashlib
import random
import ast
import sys
from pathlib import Path
from datetime import datetime
from mathutils import Vector, Matrix, Quaternion
from mathutils.bvhtree import BVHTree

def upgrade_exterior_round17(backup, output):
    backup, output = Path(backup), Path(output)
    output.mkdir(parents=True, exist_ok=True)
    base = Path(__file__).resolve().parents[1]
    source = Path(__file__).read_text(encoding='utf-8')
    bpy.ops.wm.open_mainfile(filepath=str(backup / 'tractor.blend'))
    bpy.context.preferences.filepaths.save_version = 0
    scene = bpy.context.scene
    cab = bpy.data.objects['cab']
    helpers = {'to_b', 'to_g', 'inp', 'material', 'record', 'mesh', 'box', 'cylinder',
               'tube', 'extruded_polygon', 'merge_groups'}
    module = ast.parse(source)
    definitions = ast.Module(body=[node for node in module.body
                                  if isinstance(node, ast.FunctionDef) and node.name in helpers],
                             type_ignores=[])
    ns = dict(bpy=bpy, bmesh=bmesh, math=math, Vector=Vector, scene=scene,
              STATIC=[], WHEELS={}, CAB_DETAIL_BUILD=False)
    exec(compile(definitions, str(Path(__file__)), 'exec'), ns)
    to_blender, to_game = ns['to_b'], ns['to_g']
    make_mesh, make_box, make_tube = ns['mesh'], ns['box'], ns['tube']
    make_cylinder, make_polygon = ns['cylinder'], ns['extruded_polygon']
    mats = {name: bpy.data.materials['MAT-' + name] for name in
            ('paint', 'trim', 'rubber', 'steel', 'chrome', 'glass', 'mirror',
             'lamp_front', 'reflector_amber')}
    paint, trim, rubber = (mats[name] for name in ('paint', 'trim', 'rubber'))
    steel, chrome, mirror, lamp = (mats[name] for name in ('steel', 'chrome', 'mirror', 'lamp_front'))
    removed = {}

    def remove_components(obj, predicate):
        data = obj.data
        roots = list(range(len(data.vertices)))
        def find(i):
            while roots[i] != i:
                roots[i] = roots[roots[i]]
                i = roots[i]
            return i
        for edge in data.edges:
            a, b = (find(i) for i in edge.vertices)
            roots[b] = a
        groups = {}
        for vertex in data.vertices:
            groups.setdefault(find(vertex.index), []).append(vertex.index)
        selected = set()
        for indices in groups.values():
            p = [to_game(obj.matrix_world @ data.vertices[i].co) for i in indices]
            low = [min(point[a] for point in p) for a in range(3)]
            high = [max(point[a] for point in p) for a in range(3)]
            if len(indices) > 1 and predicate(low, high):
                selected.update(indices)
        if selected:
            bm = bmesh.new()
            bm.from_mesh(data)
            bm.verts.ensure_lookup_table()
            bmesh.ops.delete(bm, geom=[bm.verts[i] for i in selected], context='VERTS')
            bm.to_mesh(data)
            bm.free()
            data.update()
            removed[obj.name] = len(selected)

    def abs_low(low, high):
        return min(abs(low[0]), abs(high[0])) if low[0] * high[0] > 0 else 0
    def old_mirror(low, high):
        return max(abs(low[0]), abs(high[0])) > 1.40 and low[1] > 2.51 and high[1] < 3.39 and low[2] > 2.95 and high[2] < 3.40
    def old_grille(low, high):
        return low[1] > 1.24 and high[1] < 2.225 and low[2] > 3.47 and max(abs(low[0]), abs(high[0])) < 1.01
    def old_light(low, high):
        return low[1] > 0.93 and high[1] < 1.201 and low[2] > 3.62 and abs_low(low, high) > 0.72
    for name in ('trim', 'rubber', 'steel', 'chrome', 'lamp_front', 'mirror', 'reflector_amber'):
        obj = bpy.data.objects.get('GEO-static-' + name)
        if obj:
            remove_components(obj, lambda low, high, n=name: old_mirror(low, high)
                              or (n in ('trim', 'rubber', 'steel') and old_grille(low, high))
                              or (n in ('trim', 'chrome', 'lamp_front', 'reflector_amber') and old_light(low, high)))
    print('ROUND17_REMOVED=' + json.dumps(removed), flush=True)

    outer = [(-0.978, 1.264, 3.680), (0.978, 1.264, 3.680), (1.010, 1.412, 3.674),
             (0.940, 2.242, 3.618), (-0.940, 2.242, 3.618), (-1.010, 1.412, 3.674)]
    inner = [(-0.865, 1.352, 3.645), (0.865, 1.352, 3.645), (0.904, 1.431, 3.641),
             (0.837, 2.162, 3.595), (-0.837, 2.162, 3.595), (-0.904, 1.431, 3.641)]
    back = [(x, y, z - .073) for x, y, z in inner]
    n = len(outer)
    make_mesh('Round17-grille-painted-surround', outer + inner,
              [(i, (i + 1) % n, (i + 1) % n + n, i + n) for i in range(n)], paint, True)
    make_mesh('Round17-grille-pocket-walls', inner + back,
              [(i, i + n, (i + 1) % n + n, (i + 1) % n) for i in range(n)], trim, True)
    make_polygon('Round17-grille-shadow-back', back, -.009, 2, trim)
    make_tube('Round17-grille-moulded-lip', inner, .010, rubber, close=True)
    cells, faces = [], []
    cell_count = 0
    for row in range(10):
        y = 1.400 + row * .079
        limit = .846 - max(0, y - 1.45) * .077
        for column in range(-10, 11):
            x = column * .093 + (row % 2) * .0465
            if abs(x) + .046 > limit:
                continue
            z = 3.593 - (y - 1.4) * .063
            index = len(cells)
            for radius, depth in ((.046, 0), (.0385, 0), (.0385, -.030)):
                cells.extend((x + math.cos(i * math.tau / 6) * radius,
                              y + math.sin(i * math.tau / 6) * radius, z + depth) for i in range(6))
            for i in range(6):
                j = (i + 1) % 6
                faces.extend(((index + i, index + j, index + j + 6, index + i + 6),
                              (index + i + 6, index + j + 6, index + j + 12, index + i + 12)))
            cell_count += 1
    make_mesh('Round17-grille-cellular-core', cells, faces, trim)
    for row in range(5):
        y = 1.433 + row * .157
        width = 1.72 - row * .028
        z = 3.630 - row * .010
        section = [(-width / 2, y - .022, z - .014), (width / 2, y - .022, z - .014),
                   (width / 2, y + .011, z + .009), (-width / 2, y + .011, z + .009)]
        make_polygon('Round17-grille-aero-slat', section, -.039, 2, trim, True)
        if row in (0, 4):
            make_tube('Round17-grille-satin-leading-edge', [(-width / 2 + .028, y + .010, z + .009),
                                                          (width / 2 - .028, y + .010, z + .009)], .004, steel)
    lens = ns['material']('MAT-headlamp_lens', (.34, .44, .50), .055, coat=1, alpha=.34)
    for side in (-1, 1):
        contour = [(side * .738, .964, 3.783), (side * 1.178, .941, 3.684),
                   (side * 1.201, 1.130, 3.666), (side * .803, 1.195, 3.746)]
        centre = tuple(sum(p[a] for p in contour) / 4 for a in range(3))
        inset = [tuple(centre[a] + (p[a] - centre[a]) * .88 for a in range(3)) for p in contour]
        make_mesh('Round17-headlamp-black-bezel', contour + inset,
                  [(i, (i + 1) % 4, (i + 1) % 4 + 4, i + 4) for i in range(4)], trim, True)
        dark = [(x, y, z - .033) for x, y, z in inset]
        make_polygon('Round17-headlamp-recess', dark, -.013, 2, trim)
        for x in (.870, 1.058):
            z = 3.763 - (x - .87) * .3
            make_cylinder('Round17-projector-reflector', (side * x, 1.075, z - .006),
                          (side * x, 1.075, z + .014), .061, chrome, 24, radius2=.048)
            make_cylinder('Round17-projector-lens', (side * x, 1.075, z + .014),
                          (side * x, 1.075, z + .021), .039, lamp, 24, radius2=.035)
        make_tube('Round17-headlamp-daylight-guide', [(side * .780, .989, 3.7938869),
                  (side * 1.152, .971, 3.7008869), (side * 1.180, 1.083, 3.6808869)], .010, lamp)
        make_polygon('Round17-headlamp-glazing', [(x, y, z + .012) for x, y, z in inset], .001, 2, lens, True)
        make_box('Round17-headlamp-turn-signal', (side * 1.15, 1.170, 3.663), (.078, .022, .014), mats['reflector_amber'], .007)

    def rounded_ring(cx, cy, width, height, radius, z):
        points = []
        corners = [(cx + width / 2 - radius, cy + height / 2 - radius, 0),
                   (cx - width / 2 + radius, cy + height / 2 - radius, 1),
                   (cx - width / 2 + radius, cy - height / 2 + radius, 2),
                   (cx + width / 2 - radius, cy - height / 2 + radius, 3)]
        for x, y, corner in corners:
            for i in range(6):
                a = corner * math.pi / 2 + i * math.pi / 10
                points.append((x + math.cos(a) * radius, y + math.sin(a) * radius, z))
        return points
    for side in (-1, 1):
        make_tube('Round17-mirror-upper-arm', [(side * 1.254, 3.319, 3.005),
                  (side * 1.405, 3.337, 3.121), (side * 1.548, 3.188, 3.228)], .022, trim)
        make_tube('Round17-mirror-lower-arm', [(side * 1.28, 2.616, 3.056),
                  (side * 1.450, 2.587, 3.198), (side * 1.548, 2.710, 3.209)], .023, trim)
        for y, height, width, z in ((3.009, .515, .201, 3.19), (2.638, .217, .194, 3.16)):
            rings = []
            for scale, depth in ((.89, -.127), (1, -.114), (1, -.065), (.88, .072), (.58, .110)):
                rings.extend(rounded_ring(side * 1.548, y, width * scale, height * scale,
                                          .042 * scale, z + depth))
            n = 24
            shape_faces = [(row * n + i, row * n + (i + 1) % n,
                            (row + 1) * n + (i + 1) % n, (row + 1) * n + i)
                           for row in range(4) for i in range(n)]
            shape_faces.append(tuple(range(4 * n, 5 * n)))
            make_mesh('Round17-mirror-aero-casting', rings, shape_faces, trim, True)
            rim = rounded_ring(side * 1.548, y, width * .80, height * .80, .033, z - .128)
            make_tube('Round17-mirror-recessed-rubber-bead', rim, .004, rubber, close=True)
            center_point = (side * 1.548, y, z - .136)
            make_mesh('Round17-mirror-convex-lens', [center_point] + rim,
                      [(0, (i + 1) % n + 1, i + 1) for i in range(n)], mirror, True)
        make_box('Round17-mirror-marker', (side * 1.648, 2.899, 3.191), (.005, .030, .091), mats['reflector_amber'], .002)

    moulded = ns['material']('MAT-tyre_moulded', (.016, .017, .018), .91)
    alloy = ns['material']('MAT-wheel_alloy', (.52, .55, .58), .26, .94)
    normal_image = bpy.data.images.new('vehicle-rubber-micro-normal', width=256, height=256, alpha=False)
    normal_image.colorspace_settings.name = 'Non-Color'
    pixels = []
    for j in range(256):
        v = (j + .5) / 256 * 2 - 1
        for i in range(256):
            u = (i + .5) / 256 * 2 - 1
            radius = max(.01, math.hypot(u, v))
            radial = .052 * math.cos(radius * 355) * (1 if .55 < radius < .89 else .12)
            gx = .027 * math.sin(u * 1073 + v * 1511) + radial * u / radius
            gy = .027 * math.sin(u * 1543 - v * 1291) + radial * v / radius
            nz = math.sqrt(1 - gx * gx - gy * gy)
            pixels.extend((.5 + gx / 2, .5 + gy / 2, .5 + nz / 2, 1))
    normal_image.pixels.foreach_set(pixels)
    normal_image.pack()
    for mat, strength in ((moulded, .75), (alloy, .13)):
        nodes, links = mat.node_tree.nodes, mat.node_tree.links
        tex = nodes.new('ShaderNodeTexImage')
        tex.image = normal_image
        normal = nodes.new('ShaderNodeNormalMap')
        normal.inputs['Strength'].default_value = strength
        links.new(tex.outputs['Color'], normal.inputs['Color'])
        links.new(normal.outputs['Normal'], nodes.get('Principled BSDF').inputs['Normal'])
    for obj in scene.objects:
        if obj.type != 'MESH' or not obj.name.startswith('GEO-wheel_'):
            continue
        old = obj.data.materials[0].name
        obj.data.materials[0] = moulded if old == 'MAT-rubber' else alloy
        uv = obj.data.uv_layers.active
        for poly in obj.data.polygons:
            for loop_index in poly.loop_indices:
                co = obj.data.vertices[obj.data.loops[loop_index].vertex_index].co
                if abs(poly.normal.x) > .65:
                    uv.data[loop_index].uv = (.5 - co.y / 1.12, .5 + co.z / 1.12)

    for obj in ns['STATIC']:
        if obj.type != 'MESH':
            continue
        data = obj.data
        uv = data.uv_layers.new(name='UVMap')
        uv.active_render = True
        coords = [v.co for v in data.vertices]
        low = [min(v[a] for v in coords) for a in range(3)]
        span = [max(v[a] for v in coords) - low[a] for a in range(3)]
        for poly in data.polygons:
            dominant = max(range(3), key=lambda a: abs(poly.normal[a]))
            axes = [a for a in range(3) if a != dominant]
            for li in poly.loop_indices:
                co = data.vertices[data.loops[li].vertex_index].co
                uv.data[li].uv = tuple((co[a] - low[a]) / max(span[a], .001) for a in axes)
    groups = {}
    for obj in ns['STATIC']:
        groups.setdefault(obj.data.materials[0].name, []).append(obj)
    for matname, objects in groups.items():
        existing = bpy.data.objects.get('GEO-static-' + matname.removeprefix('MAT-'))
        name = existing.name if existing else 'GEO-round17-' + matname.removeprefix('MAT-')
        bpy.ops.object.select_all(action='DESELECT')
        for obj in objects + ([existing] if existing else []):
            obj.select_set(True)
        bpy.context.view_layer.objects.active = existing or objects[0]
        bpy.ops.object.join()
        merged = bpy.context.object
        merged.name = name
        world_matrix = merged.matrix_world.copy()
        merged.parent = cab
        merged.matrix_parent_inverse = cab.matrix_world.inverted()
        merged.matrix_world = world_matrix
    bpy.context.view_layer.update()
    runtime_objects = [o for o in scene.objects if o.type in {'MESH', 'EMPTY'} and not o.name.startswith('PREVIEW-')]
    tris = 0
    for obj in runtime_objects:
        if obj.type == 'MESH':
            obj.data.calc_loop_triangles()
            tris += len(obj.data.loop_triangles)
    assert tris <= 82000, tris
    contract = json.loads((base / 'tmp/qa/cab-contract.json').read_text(encoding='utf-8'))
    export_scope = dict(ns, BASE=base, EXPORT_PATH=output / 'staging-export.glb', MODEL_PATH=output / 'tractor.glb',
                        BUILD_PROOFS=output, runtime_objects=runtime_objects, tris=tris,
                        struct=struct, json=json, hashlib=hashlib, Matrix=Matrix,
                        steer_center=contract['steering']['center'], STEERING_TILT=contract['steering']['base_rx_rad'],
                        WIPER_TILT=contract['wipers']['wiper_left']['base_rx_rad'],
                        GAUGE_CONTRACT={name: {key: value for key, value in data.items() if key in ('center', 'radius', 'width', 'height')}
                                        for name, data in contract['gauges'].items()},
                        WIPERS={name: dict(center=data['pivot'], park_deg=0., sweep_min_deg=0., sweep_max_deg=80.,
                                arm_mesh=bpy.data.objects[name + '_arm'], blade_mesh=bpy.data.objects[name + '_blade'])
                                for name, data in contract['wipers'].items()})
    begin = source.index("\nbpy.ops.object.select_all(action='DESELECT')\nfor obj in runtime_objects:")
    end = source.index("\nworld = bpy.data.worlds.new('Preview-daylight')", begin)
    block = source[begin:end].replace("(BASE / 'tmp/qa/cab-contract.json')", "(BUILD_PROOFS / 'cab-contract-preserved.json')")
    exec(compile(block, str(Path(__file__)), 'exec'), export_scope)
    bpy.ops.wm.save_as_mainfile(filepath=str(output / 'tractor.blend'))
    final = export_scope['gltf']
    stats = dict(sha256=hashlib.sha256((output / 'tractor.glb').read_bytes()).hexdigest(),
                 bytes=(output / 'tractor.glb').stat().st_size,
                 triangles=export_scope['tris'], primitives=sum(len(m['primitives']) for m in final['meshes']),
                 materials=len(final['materials']), embedded_images=len(final.get('images', [])),
                 grille_cells=cell_count, removed_components_vertices=removed,
                 baseline_sha256=hashlib.sha256((backup / 'tractor.glb').read_bytes()).hexdigest())
    (output / 'stats.json').write_text(json.dumps(stats, indent=2), encoding='utf-8')
    print('ROUND17_ASSET=' + json.dumps(stats), flush=True)

if '--exterior-round17' in sys.argv:
    argument = sys.argv.index('--exterior-round17')
    upgrade_exterior_round17(sys.argv[argument + 1], sys.argv[argument + 2])
    raise SystemExit(0)

BASE = Path(__file__).resolve().parents[1]
MODEL_PATH = BASE / 'game/assets/models/tractor.glb'
BLEND_PATH = BASE / 'tmp/assets/tractor.blend'
BUILD_PROOFS = BASE / ('tmp/qa/cab-build-' + datetime.now().strftime('%Y%m%d-%H%M%S'))
BUILD_PROOFS.mkdir(parents=True, exist_ok=False)
PREVIEW_PATH = BUILD_PROOFS / 'exterior.png'
EXPORT_PATH = BUILD_PROOFS / 'tractor.glb'
STATS_PATH = BUILD_PROOFS / 'stats.json'
for output in (MODEL_PATH, BLEND_PATH, PREVIEW_PATH):
    output.parent.mkdir(parents=True, exist_ok=True)

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.context.preferences.filepaths.save_version = 0
scene = bpy.context.scene
scene.unit_settings.system = 'METRIC'
scene.unit_settings.scale_length = 1

def to_b(p):
    return Vector((p[0], -p[2], p[1]))

def to_g(p):
    return (p[0], p[2], -p[1])

def inp(node, key, value):
    for socket in node.inputs:
        if socket.name == key:
            socket.default_value = value
            return

def material(name, color, rough=0.5, metal=0, coat=0, alpha=1, emit=None):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get('Principled BSDF')
    inp(bsdf, 'Base Color', (*color, alpha))
    inp(bsdf, 'Metallic', metal)
    inp(bsdf, 'Roughness', rough)
    inp(bsdf, 'Coat Weight', coat)
    inp(bsdf, 'Coat Roughness', 0.12)
    inp(bsdf, 'Alpha', alpha)
    if alpha < 1:
        mat.surface_render_method = 'DITHERED'
        mat.use_transparent_shadow = True
    if emit:
        inp(bsdf, 'Emission Color', (*emit, 1))
        inp(bsdf, 'Emission Strength', 0.1)
    mat.diffuse_color = (*color, alpha)
    return mat

PAINT = material('MAT-paint', (0.019, 0.165, 0.147), 0.265, 0, 0.82)
TRIM = material('MAT-trim', (0.022, 0.029, 0.036), 0.43)
RUBBER = material('MAT-rubber', (0.024, 0.025, 0.027), 0.9)
STEEL = material('MAT-steel', (0.59, 0.62, 0.65), 0.34, 1)
CHROME = material('MAT-chrome', (0.66, 0.68, 0.7), 0.16, 1)
GLASS = material('MAT-glass', (0.038, 0.077, 0.092), 0.065, 0, 0.95, 0.27)
MIRROR = material('MAT-mirror', (0.77, 0.8, 0.83), 0.075, 1)
LAMP = material('MAT-lamp_front', (0.81, 0.88, 0.9), 0.16, 0, 0.9, emit=(0.85, 0.93, 1))
RED = material('MAT-reflector_red', (0.5, 0.012, 0.008), 0.25, 0, 0.8, emit=(0.55, 0.025, 0.012))
AMBER = material('MAT-reflector_amber', (0.9, 0.31, 0.025), 0.24, 0, 0.8, emit=(1, 0.42, 0.06))
INTERIOR = material('MAT-interior', (0.065, 0.075, 0.087), 0.83)
SCREEN = material('MAT-dashboard_screen', (0.12, 0.26, 0.29), 0.38, emit=(0.08, 0.27, 0.32))
POLYMER = material('MAT-cockpit_polymer', (0.070, 0.081, 0.091), 0.73)
LEATHER = material('MAT-steering_leather', (0.020, 0.024, 0.028), 0.69)
grain = bpy.data.images.new('cockpit-grain-normal', width=128, height=128, alpha=False)
grain.colorspace_settings.name = 'Non-Color'
rng = random.Random(4318)
pixels = []
for _ in range(128 * 128):
    gx, gy = rng.uniform(-0.11, 0.11), rng.uniform(-0.11, 0.11)
    gz = math.sqrt(max(0, 1 - gx * gx - gy * gy))
    pixels.extend((gx * 0.5 + 0.5, gy * 0.5 + 0.5, gz * 0.5 + 0.5, 1))
grain.pixels.foreach_set(pixels)
grain.pack()
for mat, strength in ((POLYMER, 0.17), (LEATHER, 0.35)):
    nodes, links = mat.node_tree.nodes, mat.node_tree.links
    tex = nodes.new('ShaderNodeTexImage')
    tex.image = grain
    normal = nodes.new('ShaderNodeNormalMap')
    normal.inputs['Strength'].default_value = strength
    links.new(tex.outputs['Color'], normal.inputs['Color'])
    links.new(normal.outputs['Normal'], nodes.get('Principled BSDF').inputs['Normal'])
STATIC = []
WHEELS = {}
WIPERS = {}
CAB_DETAIL_BUILD = False
GAUGE_CONTRACT = {
    'gauge_fuel': {'center': (0.35, 2.555, 3.012), 'radius': 0.092},
    'gauge_speed': {'center': (0.79, 2.555, 3.012), 'radius': 0.100},
    'gauge_display': {'center': (0.57, 2.535, 3.008), 'width': 0.182, 'height': 0.110},
}

def bevel_mesh(obj, width, segments=2):
    bpy.context.view_layer.objects.active = obj
    mod = obj.modifiers.new('Soft-moulded-edge', 'BEVEL')
    mod.width = width
    mod.segments = 1
    bpy.ops.object.modifier_apply(modifier=mod.name)
    mod = obj.modifiers.new('Moulded-normals', 'WEIGHTED_NORMAL')
    mod.keep_sharp = True
    bpy.ops.object.modifier_apply(modifier=mod.name)
    return obj

def record(obj, mat, name, wheel=None, smooth=False):
    obj.name = 'GEO-' + name
    obj.data.materials.append(mat)
    if smooth:
        for poly in obj.data.polygons:
            poly.use_smooth = True
    if wheel is None:
        STATIC.append(obj)
    else:
        WHEELS[wheel].append(obj)
    return obj

def mesh(name, points, faces, mat, smooth=False, wheel=None):
    data = bpy.data.meshes.new('MESH-' + name)
    data.from_pydata([to_b(p) for p in points], [], faces)
    data.update()
    bm = bmesh.new()
    bm.from_mesh(data)
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    bm.to_mesh(data)
    bm.free()
    obj = bpy.data.objects.new('GEO-' + name, data)
    scene.collection.objects.link(obj)
    return record(obj, mat, name, wheel, smooth)

def box(name, pos, size, mat, bevel=0, wheel=None, rotation=None):
    bpy.ops.mesh.primitive_cube_add(size=1, location=to_b(pos))
    obj = bpy.context.object
    obj.scale = (size[0], size[2], size[1])
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if rotation:
        obj.rotation_euler = rotation
    if bevel:
        mod = obj.modifiers.new('Edge-radius', 'BEVEL')
        mod.width = bevel
        mod.segments = 1 if CAB_DETAIL_BUILD else 2
        bpy.ops.object.modifier_apply(modifier=mod.name)
        mod = obj.modifiers.new('Weighted-normals', 'WEIGHTED_NORMAL')
        mod.keep_sharp = True
        bpy.ops.object.modifier_apply(modifier=mod.name)
    return record(obj, mat, name, wheel, bool(bevel))

def cylinder(name, a, b, radius, mat, vertices=16, wheel=None, radius2=None):
    delta = to_b(b) - to_b(a)
    mid = (to_b(a) + to_b(b)) / 2
    bpy.ops.mesh.primitive_cone_add(vertices=vertices, radius1=radius,
                                    radius2=radius if radius2 is None else radius2,
                                    depth=delta.length, location=mid)
    obj = bpy.context.object
    obj.rotation_mode = 'QUATERNION'
    obj.rotation_quaternion = delta.to_track_quat('Z', 'Y')
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=False)
    return record(obj, mat, name, wheel, True)

def tube(name, points, radius, mat, wheel=None, close=False, sides=6):
    curve = bpy.data.curves.new('PATH-' + name, 'CURVE')
    curve.dimensions = '3D'
    curve.resolution_u = 1
    curve.bevel_depth = radius
    curve.bevel_resolution = 1
    curve.use_fill_caps = True
    spline = curve.splines.new('POLY')
    spline.points.add(len(points) - 1)
    for point, p in zip(spline.points, points):
        point.co = (*to_b(p), 1)
    spline.use_cyclic_u = close
    obj = bpy.data.objects.new('GEO-' + name, curve)
    scene.collection.objects.link(obj)
    bpy.ops.object.select_all(action='DESELECT')
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.convert(target='MESH')
    obj = bpy.context.object
    obj.select_set(False)
    return record(obj, mat, name, wheel, True)

def patch(name, corner_points, mat, bevel=0.01):
    obj = mesh(name, corner_points, [tuple(range(len(corner_points)))], mat)
    if bevel:
        mod = obj.modifiers.new('Panel-thickness', 'SOLIDIFY')
        mod.thickness = bevel
        bpy.context.view_layer.objects.active = obj
        bpy.ops.object.modifier_apply(modifier=mod.name)
    return obj

def extruded_polygon(name, contour, depth, axis, mat, smooth=False, wheel=None):
    points = [tuple(p) for p in contour]
    count = len(points)
    back = []
    for p in points:
        q = list(p)
        q[axis] += depth
        back.append(tuple(q))
    faces = [tuple(reversed(range(count))), tuple(range(count, 2 * count))]
    faces.extend((i, (i + 1) % count, (i + 1) % count + count, i + count) for i in range(count))
    return mesh(name, points + back, faces, mat, smooth, wheel)

def round_rect_ring(w, back, front, radius, height):
    corners = [(w - radius, front - radius, 0), (-w + radius, front - radius, 1),
               (-w + radius, back + radius, 2), (w - radius, back + radius, 3)]
    points = []
    for cx, cz, corner in corners:
        for i in range(5):
            theta = corner * math.pi / 2 + i * math.pi / 8
            points.append((cx + radius * math.cos(theta), height, cz + radius * math.sin(theta)))
        ncx, ncz, _ = corners[(corner + 1) % 4]
        nexttheta = (corner + 1) * math.pi / 2
        end = (ncx + radius * math.cos(nexttheta), height, ncz + radius * math.sin(nexttheta))
        start = points[-1]
        for j in range(1, 13):
            f = j / 13
            points.append(tuple(start[k] * (1 - f) + end[k] * f for k in range(3)))
    return points

def preserve_exterior(objects, baseline=MODEL_PATH):
    if not Path(baseline).exists():
        return
    baseline_blob = Path(baseline).read_bytes()
    jlen = struct.unpack_from('<I', baseline_blob, 12)[0]
    model = json.loads(baseline_blob[20:20 + jlen])
    content = baseline_blob[28 + jlen:]
    transforms = {}
    def visit(index, parent):
        node = model['nodes'][index]
        if 'matrix' in node:
            values = node['matrix']
            local = Matrix([[values[col * 4 + row] for col in range(4)] for row in range(4)])
        else:
            x, y, z, w = node.get('rotation', (0, 0, 0, 1))
            local = Matrix.Translation(Vector(node.get('translation', (0, 0, 0))))
            local @= Quaternion((w, x, y, z)).to_matrix().to_4x4()
            local @= Matrix.Diagonal((*node.get('scale', (1, 1, 1)), 1))
        transforms[index] = parent @ local
        for child in node.get('children', []):
            visit(child, transforms[index])
    for index in model['scenes'][model.get('scene', 0)]['nodes']:
        visit(index, Matrix.Identity(4))
    def values(index):
        a = model['accessors'][index]
        view = model['bufferViews'][a['bufferView']]
        dimensions = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3}[a['type']]
        component = {5121: 'B', 5123: 'H', 5125: 'I', 5126: 'f'}[a['componentType']]
        width = struct.calcsize('<' + component) * dimensions
        stride = view.get('byteStride', width)
        begin = view.get('byteOffset', 0) + a.get('byteOffset', 0)
        return [struct.unpack_from('<' + component * dimensions, content, begin + i * stride) for i in range(a['count'])]
    old_nodes = {node['name']: (i, node) for i, node in enumerate(model['nodes'])}
    kept = {}
    for obj in objects:
        if obj.name not in ('GEO-wheel_FL-rubber', 'GEO-wheel_FR-rubber', 'GEO-static-lamp_front'):
            continue
        if obj.name not in old_nodes:
            continue
        index, node = old_nodes[obj.name]
        primitives = model['meshes'][node['mesh']]['primitives']
        assert len(primitives) == 1
        prim = primitives[0]
        matrix = transforms[index]
        old_points = [matrix @ Vector(p) for p in values(prim['attributes']['POSITION'])]
        old_normals = [matrix.to_3x3() @ Vector(n) for n in values(prim['attributes']['NORMAL'])]
        old_uv = values(prim['attributes']['TEXCOORD_0'])
        indices = [p[0] for p in values(prim['indices'])]
        triangles = [indices[i:i + 3] for i in range(0, len(indices), 3)]
        if obj.name == 'GEO-static-lamp_front':
            triangles = [face for face in triangles if max(old_points[i].y for i in face) < 2.3]
        used = sorted({i for face in triangles for i in face})
        remap = {index: new_index for new_index, index in enumerate(used)}
        inverse = obj.matrix_world.inverted()
        points = [inverse @ to_b(old_points[i]) for i in used]
        normals = [(inverse.to_3x3() @ to_b(old_normals[i])).normalized() for i in used]
        faces = [tuple(remap[i] for i in face) for face in triangles]
        replacement = bpy.data.meshes.new('MESH-preserved-' + obj.name)
        replacement.from_pydata(points, [], faces)
        replacement.update()
        replacement.materials.append(obj.data.materials[0])
        for poly in replacement.polygons:
            poly.use_smooth = True
        replacement.normals_split_custom_set_from_vertices(normals)
        uv = replacement.uv_layers.new(name='UVMap')
        uv.active_render = True
        for loop in replacement.loops:
            uv.data[loop.index].uv = old_uv[used[loop.vertex_index]]
        previous_mesh = obj.data
        obj.data = replacement
        if previous_mesh.users == 0:
            bpy.data.meshes.remove(previous_mesh)
        kept[obj.name] = len(triangles)
    print('PRESERVED_EXTERIOR=' + json.dumps(kept), flush=True)

levels = [
    (1.12, 1.255, 0.57, 3.64, 0.19),
    (1.30, 1.27, 0.56, 3.66, 0.22),
    (1.45, 1.275, 0.56, 3.67, 0.23),
    (1.60, 1.27, 0.56, 3.62, 0.25),
    (1.90, 1.27, 0.56, 3.61, 0.25),
    (2.20, 1.27, 0.56, 3.60, 0.25),
    (2.40, 1.265, 0.57, 3.58, 0.25),
    (2.52, 1.255, 0.59, 3.55, 0.25),
    (2.68, 1.247, 0.61, 3.51, 0.25),
    (2.90, 1.23, 0.64, 3.45, 0.25),
    (3.13, 1.212, 0.67, 3.385, 0.25),
    (3.31, 1.20, 0.70, 3.33, 0.25),
    (3.45, 1.185, 0.74, 3.28, 0.28),
    (3.60, 1.173, 0.80, 3.24, 0.31),
    (3.76, 1.153, 0.87, 3.18, 0.35),
    (3.88, 1.116, 1.00, 3.09, 0.40),
    (3.96, 1.035, 1.16, 2.96, 0.44),
    (4.005, 0.91, 1.31, 2.83, 0.48),
    (4.025, 0.72, 1.48, 2.64, 0.49),
    (4.031, 0.45, 1.70, 2.41, 0.345),
]
cab_points = []
for height, width, back, front, radius in levels:
    cab_points.extend(round_rect_ring(width, back, front, radius, height))
perim = len(cab_points) // len(levels)
cab_faces = []
for row in range(len(levels) - 1):
    for col in range(perim):
        idx = row * perim + col
        quad = (idx, row * perim + (col + 1) % perim,
                (row + 1) * perim + (col + 1) % perim, (row + 1) * perim + col)
        centre = tuple(sum(cab_points[i][axis] for i in quad) / 4 for axis in range(3))
        x, y, z = centre
        front_window = 2.52 < y < 3.31 and z > 3.31 and abs(x) < 1.055
        side_width = (levels[row][1] + levels[row + 1][1]) / 2
        side_window = 2.52 < y < 3.31 and abs(x) > side_width - 0.003 and 1.09 < z < 3.035
        grille_hole = 1.30 < y < 2.20 and z > 3.35 and abs(x) < 0.95
        if not (front_window or side_window or grille_hole):
            cab_faces.append(quad)
cab_faces.extend([tuple(reversed(range(perim))), tuple(range((len(levels) - 1) * perim, len(levels) * perim))])
for i, (x, y, z) in enumerate(cab_points):
    row = i // perim
    height, width, back, front, radius = levels[row]
    if abs(x) > width - 0.006:
        f = (z - back) / (front - back)
        swelling = 0.026 * math.sin(math.pi * f) * max(0, 1 - abs(y - 2.04) / 0.60)
        cab_points[i] = (x + math.copysign(swelling, x), y, z)
    elif z > front - 0.008 and y < 2.52:
        crown = 0.027 * (1 - (x / width) ** 2) * math.sin((y - 1.12) / 1.40 * math.pi)
        cab_points[i] = (x, y, z + crown)
mesh('Cab-shaped-shell', cab_points, cab_faces, PAINT, True)
lining_points = [(x - math.copysign(0.018, x) if abs(x) > 0.02 else x,
                  y - 0.018 if y > 2.55 else y + 0.018,
                  z - 0.018 if z > 2.11 else z + 0.018) for x, y, z in cab_points]
lining_faces = [face for face in cab_faces if sum(cab_points[i][1] for i in face) / len(face) > 1.97]
lining = mesh('Cab-inner-shaped-lining', lining_points, lining_faces, INTERIOR, True)
bm = bmesh.new()
bm.from_mesh(lining.data)
bmesh.ops.reverse_faces(bm, faces=list(bm.faces))
bm.to_mesh(lining.data)
bm.free()
shell_bvh = BVHTree.FromPolygons([to_b(p) for p in cab_points], cab_faces)
lining_bvh = BVHTree.FromPolygons([to_b(p) for p in lining_points], lining_faces)
aperture_tests = {}
eye = to_b((0.57, 2.88, 1.70))
for label, direction in (('windshield', (0, 0, 1)), ('side_left', (1, 0, 0)), ('side_right', (-1, 0, 0))):
    vector = to_b(direction)
    shell_hit = shell_bvh.ray_cast(eye, vector, 10)[0]
    lining_hit = lining_bvh.ray_cast(eye, vector, 10)[0]
    aperture_tests[label] = {'paint_blocks_view': shell_hit is not None,
                             'lining_blocks_view': lining_hit is not None}
assert not any(test['paint_blocks_view'] or test['lining_blocks_view'] for test in aperture_tests.values()), aperture_tests

wind_points = []
wind_faces = []
for row in range(9):
    f = row / 8
    width = 1.071 - f * 0.033
    for col in range(25):
        u = col / 24 * 2 - 1
        corner = max(0, (abs(u) - 0.86) / 0.14) ** 2
        y = 2.52 + f * 0.78 + 0.047 * (1 - 2 * f) * corner
        x = width * u
        z = 3.559 - 0.240 * f + 0.022 * (1 - u * u)
        wind_points.append((x, y, z))
        if row and col:
            n = row * 25 + col
            wind_faces.append((n - 26, n - 25, n, n - 1))
mesh('Windshield-curved', wind_points, wind_faces, GLASS, True)
wind_rim = [wind_points[i] for i in range(25)] + [wind_points[i * 25 + 24] for i in range(1, 9)]
wind_rim += [wind_points[8 * 25 + i] for i in range(23, -1, -1)]
wind_rim += [wind_points[i * 25] for i in range(7, 0, -1)]
surround, surround_faces = [], []
for scale_x, scale_y, inset in ((1.087, 1.17, 0.004), (1.025, 1.06, 0.020), (1.0, 1.0, 0.002)):
    for x, y, z in wind_rim:
        yy = 2.91 + (y - 2.91) * scale_y
        surround.append((x * scale_x, yy, z - (yy - y) * 0.30 + inset))
ring_n = len(wind_rim)
for row in range(2):
    for i in range(ring_n):
        j = (i + 1) % ring_n
        surround_faces.append((row * ring_n + i, row * ring_n + j,
                               (row + 1) * ring_n + j, (row + 1) * ring_n + i))
mesh('Recessed-windshield-aperture', surround, surround_faces, TRIM, True)
tube('Windshield-seal', [(x, y, z + 0.004) for x, y, z in wind_rim], 0.012, RUBBER, close=True)
tube('Windshield-outer-aperture-joint', surround[:ring_n], 0.006, RUBBER, close=True)
for side in (-1, 1):
    points = [(side * 1.269, 2.50, 1.055), (side * 1.269, 2.51, 3.075),
              (side * 1.216, 3.275, 3.057), (side * 1.207, 3.324, 2.63),
              (side * 1.207, 3.324, 1.055)]
    patch('Door-window', points, GLASS, 0)
    tube('Door-window-seal', points, 0.023, RUBBER, close=True)
    tube('Window-division', [(side * 1.26, 2.51, 2.66), (side * 1.21, 3.32, 2.64)], 0.011, RUBBER)
    door = [(side * 1.289, 1.19, 1.06), (side * 1.288, 1.20, 3.06),
            (side * 1.288, 2.39, 3.18), (side * 1.256, 3.38, 3.08),
            (side * 1.205, 3.39, 1.02), (side * 1.27, 1.19, 1.06)]
    tube('Door-shut-line', door, 0.006, TRIM)
    box('Door-handle-recess', (side * 1.286, 2.09, 1.27), (0.018, 0.115, 0.245), TRIM, 0.012)
    box('Door-handle', (side * 1.30, 2.115, 1.27), (0.025, 0.037, 0.193), STEEL, 0.014)
    box('Door-rubbing-strip', (side * 1.29, 1.40, 1.78), (0.024, 0.054, 1.41), TRIM, 0.016)
    box('Cab-rear-side-vent', (side * 1.272, 2.25, 0.85), (0.025, 0.30, 0.185), TRIM, 0.019)
    for y in (2.15, 2.2, 2.25, 2.3, 2.35):
        box('Cab-side-vent-fin', (side * 1.294, y, 0.85), (0.016, 0.015, 0.168), PAINT, 0.004)
    cylinder('Door-lock', (side * 1.29, 2.026, 1.26), (side * 1.312, 2.026, 1.26), 0.014, STEEL, 10)
    tube('Shoulder-panel-joint', [(side * 1.267, 2.43, 1.10), (side * 1.279, 2.432, 1.74),
                                  (side * 1.279, 2.432, 2.51), (side * 1.26, 2.44, 3.10)], 0.0045, TRIM)
    tube('Front-corner-panel-joint', [(side * 1.157, 1.24, 3.55), (side * 1.220, 1.42, 3.52),
                                      (side * 1.214, 1.93, 3.49), (side * 1.196, 2.36, 3.455)], 0.005, TRIM)
    vent = [(side * 1.271, 1.40, 3.24), (side * 1.272, 1.41, 3.34),
            (side * 1.273, 1.95, 3.34), (side * 1.272, 2.12, 3.25)]
    patch('Corner-aero-vent-recess', vent, TRIM, 0.008)
    for y in (1.48, 1.57, 1.66, 1.75, 1.84, 1.93):
        tube('Corner-vent-blade', [(side * 1.285, y, 3.259), (side * 1.285, y + 0.022, 3.327)], 0.008, PAINT)

visor_points, visor_faces = [], []
for row, (y, z, width) in enumerate(((3.374, 3.376, 1.116), (3.441, 3.366, 1.123),
                                    (3.479, 3.307, 1.10))):
    for i in range(25):
        u = i / 12 - 1
        visor_points.append((u * width, y - 0.025 * u * u, z + 0.022 * (1 - u * u)))
        if row and i:
            k = row * 25 + i
            visor_faces.append((k - 26, k - 25, k, k - 1))
mesh('Curved-windshield-sun-brow', visor_points, visor_faces, TRIM, True)
def windshield_surface(x, y):
    f = (y - 2.52) / 0.78
    for _ in range(5):
        width = 1.071 - f * 0.033
        u = x / width
        corner = max(0.0, (abs(u) - 0.86) / 0.14) ** 2
        f = (y - 2.52 - 0.047 * corner) / (0.78 - 0.094 * corner)
    width = 1.071 - f * 0.033
    return 3.559 - 0.240 * f + 0.022 * (1 - (x / width) ** 2)

WIPER_TILT = -math.atan2(0.240, 0.78)
CAB_DETAIL_BUILD = True
for name, x in (('wiper_left', -0.90), ('wiper_right', -0.10)):
    center = (x, 2.512, windshield_surface(x, 2.512) + 0.026)
    start = len(STATIC)
    arm_path = [(x, 2.512), (x + 0.16, 2.556), (x + 0.43, 2.574)]
    tube(name + '-arm', [(xx, y, windshield_surface(xx, y) + 0.050) for xx, y in arm_path], 0.009, TRIM)
    cylinder(name + '-pivot', (x, 2.512, center[2] + 0.007),
             (x, 2.512, center[2] + 0.033), 0.023, TRIM, 12)
    box(name + '-knuckle', (x + 0.43, 2.574, windshield_surface(x + 0.43, 2.574) + 0.046),
        (0.056, 0.021, 0.020), TRIM, 0.006)
    cylinder(name + '-blade-adapter', (x + 0.43, 2.574, windshield_surface(x + 0.43, 2.574) + 0.012),
             (x + 0.43, 2.574, windshield_surface(x + 0.43, 2.574) + 0.046), 0.008, TRIM, 10)
    arm_objects = STATIC[start:]
    del STATIC[start:]
    points, faces = [], []
    for i in range(18):
        xx = x + 0.10 + i / 17 * 0.68
        for yy, gap in ((2.568, 0.002), (2.580, 0.002), (2.580, 0.012), (2.568, 0.012)):
            points.append((xx, yy, windshield_surface(xx, yy) + gap))
        if i:
            n = i * 4
            for k in range(4):
                j = (k + 1) % 4
                faces.append((n - 4 + k, n - 4 + j, n + j, n + k))
    faces.extend(((3, 2, 1, 0), tuple(range(68, 72))))
    blade = mesh(name + '-blade', points, faces, TRIM)
    STATIC.remove(blade)
    WIPERS[name] = {'center': center, 'arm_objects': arm_objects, 'blade_objects': [blade],
                    'park_deg': 0.0, 'sweep_min_deg': 0.0, 'sweep_max_deg': 80.0}
CAB_DETAIL_BUILD = False

grille_contour = [(-0.91, 1.295, 3.591), (0.91, 1.295, 3.591), (0.96, 1.42, 3.589),
                 (0.895, 2.20, 3.55), (-0.895, 2.20, 3.55), (-0.96, 1.42, 3.589)]
extruded_polygon('Grille-deep-recess', grille_contour, -0.065, 2, TRIM)
tube('Grille-rim', [(x, y, z + 0.018) for x, y, z in grille_contour], 0.017, RUBBER, close=True)
for i in range(9):
    y = 1.36 + i * 0.09
    width = 1.75 - max(0, i - 1) * 0.014
    box('Grille-louver', (0, y, 3.615 - i * 0.004), (width, 0.023, 0.035), TRIM, 0.008)
    if i in (0, 4, 8):
        box('Grille-louver-edge', (0, y + 0.009, 3.639 - i * 0.004), (width - 0.04, 0.009, 0.014), STEEL, 0.003)
for x in (-0.55, -0.26, 0.26, 0.55):
    box('Grille-support', (x, 1.70, 3.62), (0.021, 0.76, 0.014), TRIM)
badge = [(-0.055, 2.25, 3.606), (0, 2.20, 3.611), (0.055, 2.25, 3.606), (0, 2.32, 3.608)]
extruded_polygon('Original-rhombus-emblem', badge, 0.009, 2, CHROME)
box('Upper-air-intake', (0, 2.385, 3.6), (1.78, 0.041, 0.026), TRIM, 0.012)

bumper_pts = []
for y, front, width in ((0.50, 3.54, 1.12), (0.60, 3.72, 1.21),
                        (0.91, 3.74, 1.27), (1.125, 3.66, 1.27)):
    bumper_pts.extend(round_rect_ring(width, 3.27, front, 0.13, y))
bumper_n = len(bumper_pts) // 4
bumper_faces = []
for row in range(3):
    for col in range(bumper_n):
        bumper_faces.append((row * bumper_n + col, row * bumper_n + (col + 1) % bumper_n,
                             (row + 1) * bumper_n + (col + 1) % bumper_n, (row + 1) * bumper_n + col))
bumper_faces.extend((tuple(reversed(range(bumper_n))), tuple(range(3 * bumper_n, 4 * bumper_n))))
mesh('Sculpted-front-bumper', bumper_pts, bumper_faces, PAINT, True)
box('Bumper-lower-intake', (0, 0.775, 3.76), (1.20, 0.258, 0.021), TRIM, 0.028)
for y in (0.71, 0.77, 0.83):
    box('Bumper-intake-fin', (0, y, 3.779), (1.125, 0.012, 0.025), STEEL, 0.004)
box('Bumper-lower-chin', (0, 0.548, 3.60), (2.18, 0.092, 0.155), TRIM, 0.022)
for side in (-1, 1):
    lamp = [(side * 0.738, 0.964, 3.78), (side * 1.178, 0.941, 3.681),
            (side * 1.201, 1.13, 3.663), (side * 0.803, 1.195, 3.743)]
    extruded_polygon('Lamp-pocket', lamp, -0.04, 2, TRIM)
    inside = [(x * 0.986 + side * 0.014, y * 0.82 + 0.196, z + 0.012) for x, y, z in lamp]
    patch('Headlight-cover', inside, LAMP, 0.007)
    for x in (0.871, 1.059):
        z = 3.77 - (x - 0.87) * 0.3
        cylinder('Headlight-projector-rim', (side * x, 1.07, z), (side * x, 1.07, z + 0.026), 0.062, CHROME, 16)
        cylinder('Headlight-projector', (side * x, 1.07, z + 0.026), (side * x, 1.07, z + 0.032), 0.043, LAMP, 16)
    tube('Daylight-light-guide', [(side * 0.778, 0.987, 3.789), (side * 1.15, 0.968, 3.70), (side * 1.18, 1.074, 3.68)], 0.015, LAMP)
    box('Front-turn-signal', (side * 1.15, 1.172, 3.662), (0.078, 0.029, 0.018), AMBER, 0.01)
    cylinder('Fog-lamp-housing', (side * 0.91, 0.655, 3.71), (side * 0.91, 0.655, 3.74), 0.057, TRIM, 16)
    cylinder('Fog-lamp-lens', (side * 0.91, 0.655, 3.74), (side * 0.91, 0.655, 3.748), 0.043, LAMP, 16)
    box('Tow-eye-cover', (side * 0.66, 0.584, 3.643), (0.134, 0.072, 0.025), TRIM, 0.02)

box('Front-plate-pocket', (0, 1.065, 3.712), (0.54, 0.13, 0.03), TRIM, 0.006)
box('Front-plate-plain', (0, 1.068, 3.73), (0.494, 0.096, 0.004), STEEL, 0.004)

for side in (-1, 1):
    upper = [(side * 1.254, 3.32, 2.98), (side * 1.42, 3.34, 3.09), (side * 1.55, 3.17, 3.2)]
    lower = [(side * 1.28, 2.62, 3.07), (side * 1.50, 2.58, 3.21), (side * 1.55, 2.81, 3.2)]
    tube('Mirror-upper-bracket', upper, 0.024, TRIM)
    tube('Mirror-lower-bracket', lower, 0.024, TRIM)
    box('Main-mirror-aero-shell', (side * 1.555, 2.99, 3.195), (0.193, 0.46, 0.235), TRIM, 0.07)
    box('Main-mirror-rear-lens', (side * 1.555, 3.01, 3.069), (0.157, 0.362, 0.012), MIRROR, 0.035)
    box('Blindspot-mirror-shell', (side * 1.546, 2.651, 3.153), (0.188, 0.192, 0.236), TRIM, 0.047)
    box('Blindspot-mirror-lens', (side * 1.546, 2.661, 3.027), (0.151, 0.144, 0.014), MIRROR, 0.03)
    box('Mirror-marker', (side * 1.645, 2.89, 3.203), (0.015, 0.038, 0.105), AMBER, 0.01)

for x in (-0.95, -0.48, 0, 0.48, 0.95):
    box('Cab-roof-marker-gasket', (x, 3.780, 3.181), (0.085, 0.035, 0.045), TRIM, 0.016)
    box('Cab-roof-marker', (x, 3.790, 3.201), (0.065, 0.025, 0.031), AMBER, 0.01)
box('Cab-roof-vent-hatch', (0, 4.055, 1.99), (0.58, 0.041, 0.64), TRIM, 0.022)
def cab_level_at(y):
    for i in range(len(levels) - 1):
        low, high = levels[i], levels[i + 1]
        if low[0] <= y <= high[0]:
            t = (y - low[0]) / (high[0] - low[0])
            return tuple(low[k] * (1 - t) + high[k] * t for k in range(1, 5))
    return levels[-1][1:]
for side in (-1, 1):
    tube('Roof-airfoil-seam', [(side * 1.10, 3.76, 1.20), (side * 1.01, 3.95, 1.60),
                              (side * 1.01, 3.95, 2.40), (side * 1.10, 3.80, 2.85)], 0.0045, TRIM)
    fairing_points, fairing_faces = [], []
    fairing_rows = (1.42, 1.61, 2.04, 2.58, 3.15, 3.45, 3.65, 3.79, 3.87)
    for row, y in enumerate(fairing_rows):
        width, back, front, radius = cab_level_at(y)
        extent = 0.17 + 0.06 * math.sin((y - 1.42) * 1.2)
        for k in range(7):
            t = k / 6
            x = side * (width + 0.01 + 0.016 * math.sin(math.pi * t))
            z = back + 0.21 - t * (0.21 + extent)
            fairing_points.append((x, y, z))
            if row and k:
                n = row * 7 + k
                fairing_faces.append((n - 8, n - 7, n, n - 1))
    fairing = mesh('Swept-side-air-deflector', fairing_points, fairing_faces, PAINT, True)
    mod = fairing.modifiers.new('Fairing-lip-thickness', 'SOLIDIFY')
    mod.thickness = 0.022
    bpy.context.view_layer.objects.active = fairing
    bpy.ops.object.modifier_apply(modifier=mod.name)
    tube('Side-deflector-panel-joint', [fairing_points[i * 7 + 5] for i in range(len(fairing_rows))], 0.0045, TRIM)
    box('Cab-back-vent', (side * 0.92, 2.15, 0.515), (0.163, 0.31, 0.019), TRIM, 0.01)
    for y in (2.05, 2.11, 2.17, 2.23):
        box('Rear-vent-fin', (side * 0.92, y, 0.474), (0.152, 0.012, 0.018), PAINT)
for y0, y1, width in ((1.53, 2.10, 0.765), (2.20, 2.94, 0.76), (3.10, 3.60, 0.70)):
    outline = [(-width + 0.08, y0, 0), (width - 0.08, y0, 0), (width, y0 + 0.07, 0),
               (width, y1 - 0.07, 0), (width - 0.08, y1, 0), (-width + 0.08, y1, 0),
               (-width, y1 - 0.07, 0), (-width, y0 + 0.07, 0)]
    edge = [(x, y, cab_level_at(y)[1] - 0.013) for x, y, z in outline]
    tube('Rear-pressed-panel-joint', edge, 0.007, TRIM, close=True)
    inset = [(x * 0.965, y, z - 0.009) for x, y, z in edge]
    patch('Rear-pressed-panel-face', inset, PAINT, 0.006)
for y in (1.29, 2.14, 3.025, 3.70):
    back = cab_level_at(y)[1]
    tube('Cab-back-panel-seam', [(-0.84, y, back - 0.01), (0.84, y, back - 0.01)], 0.0045, TRIM)

for side in (-1, 1):
    box('Frame-rail', (side * 0.435, 0.75, -0.51), (0.115, 0.225, 5.52), TRIM, 0.007)
    box('Frame-flange', (side * 0.435, 0.852, -0.51), (0.154, 0.036, 5.52), TRIM, 0.005)
for z in (-3.14, -2.20, -1.17, -0.10, 1.00, 2.10):
    box('Frame-cross-member', (0, 0.76, z), (0.85, 0.13, 0.09), TRIM, 0.008)
for z in (2.65, -1.25, -2.65):
    cylinder('Axle', (-1.1, 0.53, z), (1.1, 0.53, z), 0.069, TRIM, 14)
    bpy.ops.mesh.primitive_uv_sphere_add(segments=16, ring_count=8, radius=1, location=to_b((0, 0.53, z)))
    obj = bpy.context.object
    obj.scale = (0.175, 0.24, 0.14)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    record(obj, TRIM, 'Differential', smooth=True)
    for side in (-1, 1):
        cylinder('Air-spring', (side * 0.48, 0.585, z - 0.08), (side * 0.48, 0.79, z - 0.08), 0.093, RUBBER, 16)
        cylinder('Suspension-damper', (side * 0.65, 0.48, z - 0.07), (side * 0.48, 0.81, z + 0.22), 0.025, STEEL, 12)
        for layer in range(3):
            box('Leaf-spring', (side * 0.48, 0.43 + layer * 0.026, z), (0.087, 0.018, 0.92 - layer * 0.15), TRIM, 0.008)
cylinder('Propshaft', (0, 0.575, -2.53), (0, 0.62, 1.63), 0.045, STEEL, 14)
box('Transmission-housing', (0, 0.90, 1.3), (0.53, 0.39, 0.69), TRIM, 0.07)
box('Fifth-wheel-support', (0, 0.962, -2.36), (0.78, 0.105, 0.91), TRIM, 0.034)
plate = []
for i in range(33):
    ang = math.pi * 0.16 + math.pi * 1.68 * i / 32
    plate.append((math.cos(ang) * 0.55, 1.12, -2.43 + math.sin(ang) * 0.56))
plate.extend([(0.045, 1.12, -2.95), (0.045, 1.12, -2.50), (-0.045, 1.12, -2.50), (-0.045, 1.12, -2.95)])
extruded_polygon('Slotted-fifth-wheel', plate, -0.065, 1, TRIM)
tube('Fifth-wheel-lock-handle', [(0.47, 1.07, -2.35), (0.82, 1.07, -2.46), (0.85, 1.07, -2.55)], 0.018, STEEL)

for side in (-1, 1):
    cylinder('Fuel-tank', (side * 0.966, 0.70, -0.68), (side * 0.966, 0.70, 0.62), 0.29, STEEL, 32)
    cylinder('Tank-end-cap', (side * 0.966, 0.70, -0.709), (side * 0.966, 0.70, -0.673), 0.267, STEEL, 32)
    for z in (-0.49, 0.42):
        points = []
        for i in range(25):
            angle = i * math.pi * 2 / 24
            points.append((side * 0.966 + math.cos(angle) * 0.295, 0.70 + math.sin(angle) * 0.295, z))
        tube('Tank-strap', points, 0.018, TRIM, close=True)
    cylinder('Fuel-cap', (side * 1.15, 0.91, 0.45), (side * 1.195, 0.951, 0.45), 0.038, TRIM, 16)
    box('Tank-step-plate', (side * 0.97, 1.037, -0.006), (0.56, 0.026, 1.35), STEEL, 0.012)
    for row in range(4):
        for col in range(9):
            box('Step-antislip-hole', (side * (0.77 + row * 0.126), 1.053, -0.56 + col * 0.139), (0.021, 0.006, 0.07), TRIM)
    for y, z, depth in ((0.54, 1.09, 0.67), (0.80, 1.14, 0.63), (1.06, 1.21, 0.56)):
        box('Cab-step-carrier', (side * 1.106, y, z), (0.32, 0.082, depth), TRIM, 0.02)
        box('Cab-step-grating', (side * 1.12, y + 0.047, z), (0.29, 0.020, depth - 0.07), STEEL, 0.007)
        for i in range(6):
            box('Cab-step-grip', (side * 1.12, y + 0.062, z - depth * 0.38 + i * depth * 0.147), (0.249, 0.008, 0.017), TRIM)
    tube('Door-entry-grab-handle', [(side * 1.286, 1.77, 0.994), (side * 1.305, 1.83, 0.97),
                                   (side * 1.305, 2.23, 0.97), (side * 1.286, 2.29, 0.994)], 0.014, TRIM)

box('Catwalk-plate', (0, 1.04, -0.17), (0.96, 0.048, 0.89), STEEL, 0.011)
for i in range(10):
    box('Catwalk-tread-ridge', (0, 1.067, -0.54 + i * 0.079), (0.91, 0.007, 0.014), TRIM)
for side, mat in ((-1, RED), (1, AMBER)):
    points = [(side * 0.27, 1.36, 0.43), (side * 0.37, 1.36, 0.20)]
    for i in range(101):
        t = i / 100
        angle = 10 * math.pi * 2 * t
        points.append((side * 0.34 + math.sin(angle) * 0.06, 1.42 + math.cos(angle) * 0.06, 0.2 - t * 0.68))
    points.extend([(side * 0.34, 1.26, -0.57), (side * 0.27, 1.15, -0.68)])
    tube('Coiled-air-line', points, 0.012, mat)
tube('Electrical-umbilical', [(0, 1.38, 0.43), (0.1, 1.5, 0.23), (0.12, 1.44, -0.22), (0, 1.08, -0.65)], 0.02, RUBBER)

def fender(name, side, z, rear=False):
    outer = side * 1.285
    inner = side * (0.80 if rear else 0.91)
    points, faces = [], []
    arch_section = ((inner, 0.615), (outer - side * 0.023, 0.615),
                    (outer + side * 0.011, 0.632), (outer + side * 0.006, 0.655),
                    (outer - side * 0.024, 0.669), (inner, 0.657))
    for i in range(33):
        a = math.pi * 0.025 + math.pi * 0.95 * i / 32
        for x, radius in arch_section:
            points.append((x, 0.55 + math.sin(a) * radius, z + math.cos(a) * radius))
    for row in range(32):
        for i in range(6):
            j = (i + 1) % 6
            faces.append((row * 6 + i, row * 6 + j, (row + 1) * 6 + j, (row + 1) * 6 + i))
    faces.extend((tuple(reversed(range(6))), tuple(range(192, 198))))
    mesh(name, points, faces, TRIM if rear else PAINT, True)
    tube('Fender-outer-trim', [(outer + side * 0.014, 0.55 + math.sin(math.pi * i / 32) * 0.635,
                              z + math.cos(math.pi * i / 32) * 0.635) for i in range(33)], 0.008, TRIM)
    tube('Wheel-arch-liner-lip', [(outer - side * 0.024, 0.55 + math.sin(math.pi * i / 32) * 0.611,
                                 z + math.cos(math.pi * i / 32) * 0.611) for i in range(33)], 0.012, RUBBER)
    if not rear:
        tube('Wheel-arch-panel-joint', [(outer + side * 0.006, 0.55 + math.sin(math.pi * i / 32) * 0.671,
                                        z + math.cos(math.pi * i / 32) * 0.671) for i in range(33)], 0.004, TRIM)
for side in (-1, 1):
    for z in (2.65, -1.25, -2.65):
        fender('Wheel-arch', side, z, z < 0)
    box('Front-mudflap', (side * 1.06, 0.345, 2.015), (0.353, 0.405, 0.028), RUBBER, 0.005)
    box('Rear-mudflap', (side * 1.059, 0.346, -3.31), (0.468, 0.47, 0.039), RUBBER, 0.005)
    for x in (-0.14, 0, 0.14):
        tube('Mudflap-rib', [(side * 1.05 + x, 0.20, -3.333), (side * 1.05 + x, 0.532, -3.333)], 0.006, TRIM)
    box('Rear-light-bracket', (side * 0.939, 0.675, -3.372), (0.57, 0.165, 0.11), TRIM, 0.02)
    for dx, mat in ((-0.17, RED), (0, AMBER), (0.17, LAMP)):
        box('Rear-light-lens', (side * 0.939 + dx, 0.684, -3.436), (0.142, 0.12, 0.024), mat, 0.014)
    box('Rear-reflector', (side * 1.23, 0.945, -3.13), (0.042, 0.062, 0.037), RED, 0.007)
box('Rear-impact-crossbar', (0, 0.668, -3.326), (1.56, 0.075, 0.125), TRIM, 0.012)
box('Rear-plate', (0, 0.715, -3.398), (0.48, 0.115, 0.014), STEEL, 0.005)

def lathe_x(name, center, profile, mat, wheel, slices=40):
    points, faces = [], []
    for offset, radius in profile:
        for i in range(slices):
            a = i * 2 * math.pi / slices
            points.append((center[0] + offset, center[1] + math.sin(a) * radius,
                           center[2] + math.cos(a) * radius))
    for row in range(len(profile) - 1):
        for col in range(slices):
            a = row * slices + col
            b = row * slices + (col + 1) % slices
            faces.append((a, b, b + slices, a + slices))
    return mesh(name, points, faces, mat, True, wheel)

for side, prefix in ((1, 'L'), (-1, 'R')):
    for axle, z in (('F', 2.65), ('M', -1.25), ('R', -2.65)):
        wheel = f'wheel_{axle}{prefix}'
        WHEELS[wheel] = []
        center = (side * (1.073 if axle == 'F' else 1.025), 0.55, z)
        if axle == 'F':
            profile = [(-0.177, 0.302), (-0.186, 0.327), (-0.195, 0.376), (-0.185, 0.424),
                       (-0.170, 0.472), (-0.137, 0.519), (-0.108, 0.528),
                       (-0.083, 0.530), (-0.080, 0.517), (-0.070, 0.517), (-0.066, 0.531),
                       (-0.030, 0.532), (-0.026, 0.518), (-0.016, 0.518), (-0.012, 0.533),
                       (0.012, 0.533), (0.016, 0.518), (0.026, 0.518), (0.030, 0.532),
                       (0.066, 0.531), (0.070, 0.517), (0.080, 0.517), (0.083, 0.530),
                       (0.108, 0.528), (0.137, 0.519), (0.170, 0.472), (0.185, 0.424),
                       (0.195, 0.376), (0.186, 0.327), (0.177, 0.302), (-0.177, 0.302)]
            lathe_x('Steer-tyre', center, profile, RUBBER, wheel, 48)
            tread_rows = (-0.102, 0, 0.102)
        else:
            for offset in (-0.123, 0.123):
                tire_center = (center[0] + offset, center[1], z)
                profile = [(-0.103, 0.303), (-0.113, 0.339), (-0.118, 0.38), (-0.112, 0.423),
                           (-0.103, 0.478), (-0.068, 0.525), (-0.045, 0.531), (-0.014, 0.532),
                           (-0.009, 0.518), (0.009, 0.518), (0.014, 0.532), (0.045, 0.531),
                           (0.068, 0.525), (0.103, 0.478), (0.112, 0.423), (0.118, 0.38),
                           (0.113, 0.339), (0.103, 0.303), (-0.103, 0.303)]
                lathe_x('Drive-tyre-dual', tire_center, profile, RUBBER, wheel, 40)
            tread_rows = (-0.165, -0.08, 0.08, 0.165)
        for row, offset in enumerate(tread_rows):
            for i in range(44):
                a = i * math.pi * 2 / 44 + (row % 2) * 0.045
                r0, r1 = 0.518, 0.537
                width = 0.062 if axle == 'F' else 0.057
                points = []
                for radius in (r0, r1):
                    for xoff, angle in ((-width / 2, a - 0.044), (width / 2, a - 0.031),
                                         (width / 2, a + 0.044), (-width / 2, a + 0.031)):
                        points.append((center[0] + offset + xoff,
                                       center[1] + math.sin(angle) * radius, z + math.cos(angle) * radius))
                faces = [(0, 3, 2, 1), (4, 5, 6, 7), (0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)]
                mesh('Tread-block', points, faces, RUBBER, False, wheel)
        offset = side * (0.122 if axle == 'F' else 0.165)
        rim_profile = [(-side * 0.06, 0.052), (0, 0.157), (side * 0.02, 0.245),
                       (side * 0.048, 0.289), (side * 0.063, 0.30), (side * 0.070, 0.308),
                       (side * 0.086, 0.305), (side * 0.09, 0.282), (side * 0.054, 0.265),
                       (side * 0.016, 0.203), (-side * 0.02, 0.061)]
        rimcenter = (center[0] + offset - side * 0.04, center[1], z)
        lathe_x('Stamped-steel-rim', rimcenter, rim_profile, STEEL, wheel, 40)
        cylinder('Wheel-central-hub', (center[0] + offset - side * 0.03, 0.55, z),
                 (center[0] + offset + side * 0.077, 0.55, z), 0.098, STEEL, 20, wheel)
        for i in range(10):
            a = i * math.pi * 2 / 10
            y, zz = 0.55 + math.sin(a) * 0.148, z + math.cos(a) * 0.148
            cylinder('Wheel-lug-nut', (center[0] + offset + side * 0.026, y, zz),
                     (center[0] + offset + side * 0.055, y, zz), 0.022, STEEL, 6, wheel)
            a += math.pi / 10
            y, zz = 0.55 + math.sin(a) * 0.218, z + math.cos(a) * 0.218
            cylinder('Rim-vent-shadow', (center[0] + offset + side * 0.003, y, zz),
                     (center[0] + offset + side * 0.014, y, zz), 0.029, RUBBER, 12, wheel)
        for radial in (0.337, 0.404, 0.470):
            wall = side * ((0.19 if axle == 'F' else 0.239) - max(0, radial - 0.39) * 0.31)
            profile = [(wall, radial), (wall + side * 0.003, radial + 0.003),
                       (wall + side * 0.003, radial + 0.008), (wall, radial + 0.011)]
            lathe_x('Tyre-sidewall-ring', center, profile, RUBBER, wheel, 40)
        for i in range(36):
            a = i * math.pi * 2 / 36
            wall = side * (0.18 if axle == 'F' else 0.229)
            points = []
            for radius, angle in ((0.447, a - 0.012), (0.467, a - 0.012),
                                  (0.467, a + 0.012), (0.447, a + 0.012)):
                points.append((center[0] + wall, 0.55 + math.sin(angle) * radius,
                               z + math.cos(angle) * radius))
            patch_obj = mesh('Sidewall-moulding-rib', points, [(0, 1, 2, 3)], RUBBER, True, wheel)
        cylinder('Wheel-valve-stem', (center[0] + offset + side * 0.026, 0.76, z + 0.15),
                 (center[0] + offset + side * 0.044, 0.76, z + 0.15), 0.006, RUBBER, 6, wheel)

box('Cab-interior-floor', (0, 1.985, 2.0), (2.31, 0.07, 2.70), INTERIOR, 0.01)
box('Cab-headlining', (0, 3.60, 2.00), (2.17, 0.04, 2.24), INTERIOR, 0.035)
box('Sleeper-bunk', (0, 2.11, 0.99), (2.09, 0.15, 0.51), INTERIOR, 0.035)
for side in (-1, 1):
    box('Door-inner-panel', (side * 1.178, 2.15, 2.04), (0.056, 0.43, 1.82), INTERIOR, 0.025)
    box('Door-armrest', (side * 1.112, 2.291, 1.77), (0.14, 0.085, 0.56), TRIM, 0.02)
    box('Door-interior-handle', (side * 1.137, 2.369, 2.39), (0.035, 0.053, 0.155), STEEL, 0.018)
    box('Seat-suspension-base', (side * 0.57, 2.144, 1.70), (0.40, 0.19, 0.40), TRIM, 0.02)
    box('Driver-seat-cushion', (side * 0.57, 2.276, 1.89), (0.53, 0.155, 0.58), INTERIOR, 0.068)
    box('Driver-seat-back', (side * 0.57, 2.61, 1.60), (0.52, 0.64, 0.15), INTERIOR, 0.06,
        rotation=(math.radians(-8), 0, 0))
    box('Driver-seat-headrest', (side * 0.57, 2.984, 1.568), (0.35, 0.185, 0.135), INTERIOR, 0.045)
    for dx in (-0.208, 0.208):
        tube('Seat-stitching', [(side * 0.57 + dx, 2.38, 1.513), (side * 0.57 + dx, 2.86, 1.447)], 0.003, STEEL)

dash_start = len(STATIC)
CAB_DETAIL_BUILD = True
profile = [(2.474, 3.438), (2.497, 3.176), (2.440, 2.956),
           (2.173, 2.986), (2.143, 3.168), (2.220, 3.435)]
dash_points, dash_faces = [], []
for i, x in enumerate((-1.123, -1.02, -0.63, -0.15, 0.12, 0.57, 0.97, 1.123)):
    passenger = max(0, (0.10 - x) / 1.25)
    for k, (y, z) in enumerate(profile):
        dz = -0.050 * passenger if k in (2, 3) else 0
        dash_points.append((x, y - 0.018 * passenger, z + dz))
    if i:
        for k in range(6):
            j = (k + 1) % 6
            dash_faces.append(((i - 1) * 6 + k, (i - 1) * 6 + j, i * 6 + j, i * 6 + k))
dash_faces.extend((tuple(reversed(range(6))), tuple(range(42, 48))))
bevel_mesh(mesh('Dashboard-moulded-body', dash_points, dash_faces, POLYMER), 0.020, 2)
top_points, top_faces = [], []
for i, x in enumerate((-1.104, -0.80, -0.15, 0.17, 0.59, 1.104)):
    for y, z in ((2.478, 3.433), (2.499, 3.20), (2.467, 3.038)):
        top_points.append((x, y - max(0, 0.10 - x) * 0.012, z))
    if i:
        for k in range(2):
            top_faces.append(((i - 1) * 3 + k, (i - 1) * 3 + k + 1, i * 3 + k + 1, i * 3 + k))
mesh('Dashboard-soft-top', top_points, top_faces, INTERIOR, True)
tube('Dashboard-front-shadow-seam', [(-1.08, 2.411, 2.915), (-0.6, 2.415, 2.943),
                                   (0.1, 2.426, 2.958), (1.083, 2.43, 2.958)], 0.004, TRIM)

outer = [(-0.454, -0.152), (0.454, -0.152), (0.446, 0.078), (0.401, 0.119),
         (0.30, 0.134), (-0.30, 0.134), (-0.40, 0.105), (-0.448, 0.060)]
inner = [(-0.435, -0.133), (0.435, -0.133), (0.424, 0.064), (0.382, 0.10),
         (0.29, 0.114), (-0.29, 0.114), (-0.38, 0.087), (-0.425, 0.050)]
hood_points = []
for contour, z in ((outer, 2.970), (inner, 2.994), (outer, 3.165), (inner, 3.146)):
    hood_points.extend((0.57 + x, 2.555 + y, z) for x, y in contour)
hood_faces = []
for i in range(8):
    j = (i + 1) % 8
    hood_faces.extend(((i, j, 8 + j, 8 + i), (i, 16 + i, 16 + j, j),
                       (8 + i, 8 + j, 24 + j, 24 + i), (16 + i, 24 + i, 24 + j, 16 + j)))
bevel_mesh(mesh('Instrument-cluster-sculpted-hood', hood_points, hood_faces, POLYMER), 0.006, 2)
patch('Instrument-cluster-recess', [(0.57 + x, 2.555 + y, 3.032) for x, y in inner], TRIM, 0.004)
for key in ('gauge_fuel', 'gauge_speed'):
    x, y, z = GAUGE_CONTRACT[key]['center']
    radius = GAUGE_CONTRACT[key]['radius']
    points, faces = [], []
    for r, depth in ((radius + 0.001, 3.002), (radius + 0.009, 3.002),
                     (radius + 0.009, 3.024), (radius + 0.001, 3.024)):
        for i in range(40):
            a = i * math.tau / 40
            points.append((x + r * math.cos(a), y + r * math.sin(a), depth))
    for layer in range(4):
        for i in range(40):
            j = (i + 1) % 40
            nxt = (layer + 1) % 4
            faces.append((layer * 40 + i, layer * 40 + j, nxt * 40 + j, nxt * 40 + i))
    mesh('Gauge-recessed-bezel', points, faces, POLYMER, True)
box('Digital-display-recess', (0.57, 2.535, 3.018), (0.192, 0.120, 0.008), TRIM, 0.004)

def vent(x, y, z, width, height):
    box('Vent-deep-recess', (x, y, z + 0.020), (width, height, 0.016), TRIM, 0.011)
    for yy in (y - height / 2, y + height / 2):
        box('Vent-moulded-surround', (x, yy, z), (width + 0.015, 0.009, 0.032), POLYMER, 0.004)
    for xx in (x - width / 2, x + width / 2):
        box('Vent-moulded-side', (xx, y, z), (0.009, height, 0.032), POLYMER, 0.004)
    for i in range(4):
        yy = y + (i - 1.5) * height / 5.4
        box('Vent-adjustable-louvre', (x, yy, z + 0.001), (width - 0.022, 0.005, 0.025), INTERIOR,
            rotation=(math.radians(-18), 0, 0))
    box('Vent-direction-tab', (x + width * 0.18, y - 0.002, z - 0.014), (0.013, 0.024, 0.020), TRIM, 0.003)

vent(-0.78, 2.386, 2.895, 0.257, 0.092)
vent(-0.30, 2.394, 2.914, 0.247, 0.090)
vent(1.038, 2.368, 2.937, 0.112, 0.115)
box('Central-stack-trim', (-0.22, 2.249, 2.926), (0.48, 0.214, 0.051), TRIM, 0.019)
for x in (-0.375, -0.225, -0.075):
    cylinder('Climate-knob-surround', (x, 2.252, 2.888), (x, 2.252, 2.912), 0.027, POLYMER, 16)
    cylinder('Climate-knob', (x, 2.252, 2.878), (x, 2.252, 2.893), 0.020, INTERIOR, 16)
    box('Climate-knob-index', (x, 2.266, 2.877), (0.003, 0.009, 0.003), INTERIOR)
for x in (-0.382, -0.309, -0.236, -0.163, -0.09):
    box('Central-stack-switch', (x, 2.186, 2.890), (0.048, 0.025, 0.015), INTERIOR, 0.004)
box('Passenger-glovebox', (-0.765, 2.233, 2.948), (0.60, 0.169, 0.011), INTERIOR, 0.014)
box('Glovebox-latch', (-0.765, 2.281, 2.936), (0.102, 0.017, 0.015), TRIM, 0.006)
for x in (-0.86, -0.52, 0.12, 0.85):
    box('Windshield-demister-recess', (x, 2.484, 3.32), (0.194, 0.014, 0.051), TRIM, 0.006)
    for j in range(3):
        box('Demister-vane', (x, 2.493, 3.304 + j * 0.015), (0.175, 0.007, 0.004), INTERIOR)

steer_center = (0.57, 2.49, 2.61)
STEERING_TILT = 0.775
sc, ss = math.cos(STEERING_TILT), math.sin(STEERING_TILT)

def wheel_point(u, v, depth=0):
    return (steer_center[0] + u, steer_center[1] + sc * v - ss * depth,
            steer_center[2] + ss * v + sc * depth)

cylinder('Steering-column-shroud', wheel_point(0, 0, 0.050), wheel_point(0, 0, 0.31),
         0.049, TRIM, 20, radius2=0.061)
cylinder('Steering-column-lower', wheel_point(0, 0, 0.285), wheel_point(0, 0, 0.58),
         0.040, TRIM, 16, radius2=0.048)
tube('Indicator-stalk', [wheel_point(0.042, 0, 0.10), wheel_point(0.168, 0.015, 0.115),
                         wheel_point(0.26, 0.048, 0.082)], 0.008, TRIM)
box('Indicator-stalk-grip', wheel_point(0.257, 0.048, 0.080), (0.058, 0.023, 0.029), TRIM, 0.009)
tube('Wiper-stalk', [wheel_point(-0.042, 0, 0.10), wheel_point(-0.163, -0.005, 0.106),
                     wheel_point(-0.22, 0.015, 0.080)], 0.008, TRIM)
dash_objects = STATIC[dash_start:]
del STATIC[dash_start:]

steering_start = len(STATIC)
points, faces = [], []
for i in range(64):
    a = i * math.tau / 64
    for j in range(8):
        b = j * math.tau / 8
        r = 0.222 + 0.019 * math.cos(b)
        points.append(wheel_point(r * math.cos(a), r * math.sin(a), 0.019 * math.sin(b)))
for i in range(64):
    for j in range(8):
        faces.append((i * 8 + j, ((i + 1) % 64) * 8 + j,
                      ((i + 1) % 64) * 8 + (j + 1) % 8, i * 8 + (j + 1) % 8))
mesh('Steering-wheel-rim', points, faces, LEATHER, True)

def wheel_plate(name, contour, front, rear, mat, edge=0.005):
    n = len(contour)
    points = [wheel_point(x, y, d) for d in (front, rear) for x, y in contour]
    faces = [tuple(reversed(range(n))), tuple(range(n, n * 2))]
    faces.extend((i, (i + 1) % n, (i + 1) % n + n, i + n) for i in range(n))
    return bevel_mesh(mesh(name, points, faces, mat), edge, 2)

wheel_plate('Steering-spoke-left', [(0.059, -0.029), (0.193, -0.01), (0.197, 0.028), (0.06, 0.043)],
            -0.009, 0.017, TRIM)
wheel_plate('Steering-spoke-right', [(-0.059, -0.029), (-0.06, 0.043), (-0.197, 0.028), (-0.193, -0.01)],
            -0.009, 0.017, TRIM)
wheel_plate('Steering-spoke-lower', [(-0.045, -0.045), (-0.024, -0.203), (0.024, -0.203), (0.045, -0.045)],
            -0.009, 0.022, TRIM)
wheel_plate('Steering-horn-pad', [(-0.076, -0.046), (-0.073, 0.059), (-0.043, 0.085),
                                 (0.043, 0.085), (0.073, 0.059), (0.076, -0.046), (0.042, -0.068), (-0.042, -0.068)],
            -0.035, 0.021, LEATHER, 0.008)
for side in (-1, 1):
    wheel_plate('Steering-spoke-inlay', [(side * 0.087, 0.019), (side * 0.18, 0.013),
                                       (side * 0.18, 0.022), (side * 0.087, 0.030)], -0.014, -0.009, TRIM, 0.002)
    wheel_plate('Steering-thumb-pad', [(side * 0.073, -0.011), (side * 0.110, -0.008),
                                     (side * 0.110, 0.012), (side * 0.073, 0.021)], -0.017, -0.010, LEATHER, 0.003)
steering_objects = STATIC[steering_start:]
del STATIC[steering_start:]
CAB_DETAIL_BUILD = False
box('Gear-selector-console', (-0.04, 2.12, 2.59), (0.18, 0.175, 0.26), TRIM, 0.02)
cylinder('Gear-selector', (-0.035, 2.19, 2.61), (-0.035, 2.31, 2.60), 0.014, STEEL, 12)
box('Selector-grip', (-0.035, 2.32, 2.60), (0.055, 0.047, 0.061), TRIM, 0.017)

root = bpy.data.objects.new('tractor', None)
root.empty_display_type = 'PLAIN_AXES'
scene.collection.objects.link(root)
cab = bpy.data.objects.new('cab', None)
scene.collection.objects.link(cab)
cab.parent = root

def merge_groups(objects, parent, prefix, centre=(0, 0, 0)):
    groups = {}
    merged = []
    for obj in objects:
        groups.setdefault(obj.data.materials[0].name, []).append(obj)
    for matname, group in groups.items():
        bpy.ops.object.select_all(action='DESELECT')
        for obj in group:
            obj.select_set(True)
        bpy.context.view_layer.objects.active = group[0]
        bpy.ops.object.join()
        obj = bpy.context.object
        obj.name = prefix + '-' + matname[4:]
        scene.cursor.location = to_b(centre)
        bpy.ops.object.origin_set(type='ORIGIN_CURSOR')
        obj.parent = parent
        obj.matrix_parent_inverse = parent.matrix_world.inverted()
        obj.select_set(False)
        merged.append(obj)
    return merged

merge_groups(STATIC, cab, 'GEO-static')
dash = bpy.data.objects.new('dash', None)
scene.collection.objects.link(dash)
dash.parent = cab
bpy.context.view_layer.update()
merge_groups(dash_objects, cab, 'GEO-dashboard')
for name, data in GAUGE_CONTRACT.items():
    anchor = bpy.data.objects.new(name, None)
    scene.collection.objects.link(anchor)
    anchor.location = to_b(data['center'])
    anchor.rotation_euler.z = math.pi
    anchor.parent = dash
steering = bpy.data.objects.new('steering', None)
scene.collection.objects.link(steering)
steering.location = to_b(steer_center)
steering.rotation_euler.x = STEERING_TILT
steering.parent = cab
bpy.context.view_layer.update()
merge_groups(steering_objects, steering, 'GEO-steering', steer_center)
for name, data in WIPERS.items():
    pivot = bpy.data.objects.new(name, None)
    scene.collection.objects.link(pivot)
    pivot.location = to_b(data['center'])
    pivot.rotation_euler.x = WIPER_TILT
    pivot.parent = cab
    bpy.context.view_layer.update()
    for kind in ('arm', 'blade'):
        joined = merge_groups(data[kind + '_objects'], pivot, 'GEO-' + name + '_' + kind, data['center'])
        assert len(joined) == 1
        joined[0].name = name + '_' + kind
        if kind == 'arm':
            joined[0]['wiper_standoff_m'] = 0.020
        data[kind + '_mesh'] = joined[0]
for name, objects in WHEELS.items():
    axle = name[6]
    side = 1 if name[7] == 'L' else -1
    z = {'F': 2.65, 'M': -1.25, 'R': -2.65}[axle]
    center = (side * (1.073 if axle == 'F' else 1.025), 0.55, z)
    node = bpy.data.objects.new(name, None)
    scene.collection.objects.link(node)
    node.location = to_b(center)
    node.parent = root
    bpy.context.view_layer.update()
    merge_groups(objects, node, 'GEO-' + name, center)

scene.cursor.location = (0, 0, 0)
bpy.context.view_layer.update()
runtime_objects = [obj for obj in scene.objects if obj.type in {'MESH', 'EMPTY'}]
for obj in runtime_objects:
    if obj.type != 'MESH':
        continue
    mat_name = obj.data.materials[0].name
    ratio = 1
    if 'wheel_' in obj.name and mat_name == 'MAT-rubber':
        ratio = 0.66
    elif obj.name == 'GEO-static-trim':
        ratio = 0.50
    elif obj.name == 'GEO-static-steel':
        ratio = 0.85
    elif obj.name == 'GEO-static-lamp_front':
        ratio = 0.90
    if ratio < 1:
        bpy.context.view_layer.objects.active = obj
        mod = obj.modifiers.new('Runtime-optimization', 'DECIMATE')
        mod.ratio = ratio
        bpy.ops.object.modifier_apply(modifier=mod.name)
    for old_uv in list(obj.data.uv_layers):
        obj.data.uv_layers.remove(old_uv)
    uv = obj.data.uv_layers.new(name='UVMap')
    uv.active_render = True
    coords = [v.co for v in obj.data.vertices]
    lo = [min(co[k] for co in coords) for k in range(3)]
    span = [max(co[k] for co in coords) - lo[k] for k in range(3)]
    for poly in obj.data.polygons:
        dominant = max(range(3), key=lambda k: abs(poly.normal[k]))
        axes = [k for k in range(3) if k != dominant]
        for li in poly.loop_indices:
            co = obj.data.vertices[obj.data.loops[li].vertex_index].co
            uv.data[li].uv = tuple((co[k] - lo[k]) / max(span[k], 0.001) for k in axes)
preserve_exterior(runtime_objects)
all_corners = [to_g(obj.matrix_world @ Vector(c)) for obj in runtime_objects if obj.type == 'MESH' for c in obj.bound_box]
minimum = [min(v[i] for v in all_corners) for i in range(3)]
maximum = [max(v[i] for v in all_corners) for i in range(3)]
tris = 0
for obj in runtime_objects:
    if obj.type == 'MESH':
        obj.data.calc_loop_triangles()
        tris += len(obj.data.loop_triangles)
drawcalls = sum(len(obj.data.materials) for obj in runtime_objects if obj.type == 'MESH')
print('CAB_PRE_EXPORT_MESH_BUDGET=' + json.dumps({o.name: len(o.data.loop_triangles) for o in runtime_objects if o.type == 'MESH'}), flush=True)
assert tris <= 68000, tris
assert drawcalls <= 32, drawcalls

bpy.ops.object.select_all(action='DESELECT')
for obj in runtime_objects:
    obj.select_set(True)
bpy.ops.export_scene.gltf(filepath=str(EXPORT_PATH), export_format='GLB', use_selection=True,
                          export_apply=True, export_yup=True, export_materials='EXPORT',
                          export_animations=False, export_skins=False, export_morph=False,
                          export_normals=True, export_texcoords=True, export_tangents=False,
                          export_cameras=False, export_lights=False, export_extras=False)

blob = EXPORT_PATH.read_bytes()
json_length, json_type = struct.unpack_from('<II', blob, 12)
gltf = json.loads(blob[20:20 + json_length])
gltf['asset']['generator'] = 'glTF 2.0'
binary_start = 20 + json_length
binary_length, binary_type = struct.unpack_from('<II', blob, binary_start)
binary = blob[binary_start + 8:binary_start + 8 + binary_length]
clean_views = {}
removed_triangles = 0
clean_index_accessors = {}
def exported_accessor(index):
    acc = gltf['accessors'][index]
    view = gltf['bufferViews'][acc['bufferView']]
    dimensions = {'SCALAR': 1, 'VEC3': 3}[acc['type']]
    component = {5123: 'H', 5125: 'I', 5126: 'f'}[acc['componentType']]
    width = struct.calcsize('<' + component) * dimensions
    stride = view.get('byteStride', width)
    start = view.get('byteOffset', 0) + acc.get('byteOffset', 0)
    return [struct.unpack_from('<' + component * dimensions, binary, start + i * stride)
            for i in range(acc['count'])]
for mesh_data in gltf['meshes']:
    for primitive in mesh_data['primitives']:
        accessor_id = primitive['indices']
        if accessor_id in clean_index_accessors:
            removed_triangles += clean_index_accessors[accessor_id]
            continue
        positions = exported_accessor(primitive['attributes']['POSITION'])
        index_accessor = gltf['accessors'][primitive['indices']]
        indices = [p[0] for p in exported_accessor(primitive['indices'])]
        filtered = []
        for i in range(0, len(indices), 3):
            a, b, c = (Vector(positions[indices[i + j]]) for j in range(3))
            if (b - a).cross(c - a).length_squared > 1e-16:
                filtered.extend(indices[i:i + 3])
            else:
                removed_triangles += 1
        if len(filtered) != len(indices):
            view_index = index_accessor['bufferView']
            assert index_accessor.get('byteOffset', 0) == 0
            assert sum(a.get('bufferView') == view_index for a in gltf['accessors']) == 1
            component = {5123: 'H', 5125: 'I'}[index_accessor['componentType']]
            clean_views[view_index] = struct.pack('<' + component * len(filtered), *filtered)
            index_accessor['count'] = len(filtered)
            index_accessor['min'] = [min(filtered)]
            index_accessor['max'] = [max(filtered)]
        clean_index_accessors[accessor_id] = (len(indices) - len(filtered)) // 3
chunks = bytearray()
for i, view in enumerate(gltf['bufferViews']):
    previous_start = view.get('byteOffset', 0)
    content = clean_views.get(i, binary[previous_start:previous_start + view['byteLength']])
    chunks.extend(b'\x00' * ((-len(chunks)) % 4))
    view['byteOffset'] = len(chunks)
    view['byteLength'] = len(content)
    chunks.extend(content)
gltf['buffers'][0]['byteLength'] = len(chunks)
chunks.extend(b'\x00' * ((-len(chunks)) % 4))
tail = struct.pack('<II', len(chunks), binary_type) + bytes(chunks)
tris -= removed_triangles
encoded = json.dumps(gltf, separators=(',', ':'), ensure_ascii=True).encode('utf8')
encoded += b' ' * ((-len(encoded)) % 4)
blob = struct.pack('<III', 0x46546C67, 2, 20 + len(encoded) + len(tail))
blob += struct.pack('<II', len(encoded), 0x4E4F534A) + encoded + tail
EXPORT_PATH.write_bytes(blob)
EXPORT_PATH.replace(MODEL_PATH)
exported_nodes = {n['name']: n for n in gltf['nodes']}
contract = {
    'asset_sha256': hashlib.sha256(blob).hexdigest(),
    'coordinates': 'truck local: X right, Y up, Z forward',
    'driver_camera': {'eye': [0.57, 2.88, 1.70], 'target': [0, 0.468, 35], 'vertical_fov_deg': 42, 'aspect': 16 / 9},
    'steering': {'node': 'steering', 'center': steer_center, 'base_rx_rad': STEERING_TILT,
                 'base_quaternion_xyzw': exported_nodes['steering'].get('rotation', [0, 0, 0, 1]),
                 'local_rotation_axis': [0, 0, 1], 'radius_m': 0.222,
                 'top_moves_toward_positive_z': True},
    'gauges': {name: dict(data, parent='dash', local_plane='XY', normal=[0, 0, -1],
                          quaternion_xyzw=exported_nodes[name].get('rotation', [0, 0, 0, 1]))
               for name, data in GAUGE_CONTRACT.items()},
    'wipers': {},
    'windshield_surface': {
        'f_initial': '(y-2.52)/0.78',
        'f_refine_repeat': 5,
        'f_refine': 'width=1.071-0.033*f;u=x/width;corner=max(0,(abs(u)-0.86)/0.14)**2;f=(y-2.52-0.047*corner)/(0.78-0.094*corner)',
        'z': '3.559-0.240*f+0.022*(1-(x/(1.071-0.033*f))**2)',
        'deformation': 'At neutral: cache mesh-local positions and each vertex deltaZ=neutralCabZ-surface(neutralCabX,neutralCabY). After pivot baseQ*localZ, project rotated cab-space Z=surface(x,y)+deltaZ, then transform into mesh-local space.',
        'glass_clearance_m': {'blade_min': 0.002, 'blade_max': 0.012, 'arm_min': 0.004},
        'pause': 'Freeze stroke phase while simulation is paused; return to zero on dry windshield.'
    },
    'proof_folder': str(BUILD_PROOFS),
}
for name, data in WIPERS.items():
    contract['wipers'][name] = {
        'node': name, 'pivot': data['center'], 'base_rx_rad': WIPER_TILT,
        'base_quaternion_xyzw': exported_nodes[name].get('rotation', [0, 0, 0, 1]),
        'local_rotation_axis': [0, 0, 1], 'park_deg': data['park_deg'],
        'sweep_min_deg': data['sweep_min_deg'], 'sweep_max_deg': data['sweep_max_deg'],
        'synchronize_phase': True,
        'meshes': {kind: {'name': name + '_' + kind,
                          'vertices': sum(gltf['accessors'][p['attributes']['POSITION']]['count']
                                          for p in gltf['meshes'][exported_nodes[name + '_' + kind]['mesh']]['primitives']),
                          'source_blender_vertices': len(data[kind + '_mesh'].data.vertices)}
                   for kind in ('arm', 'blade')},
    }
(BUILD_PROOFS / 'contract.json').write_text(json.dumps(contract, indent=2), encoding='utf-8')
(BASE / 'tmp/qa/cab-contract.json').write_text(json.dumps(contract, indent=2), encoding='utf-8')
print('CAB_CONTRACT=' + json.dumps(contract, ensure_ascii=True), flush=True)

world = bpy.data.worlds.new('Preview-daylight')
world.use_nodes = True
world.node_tree.nodes['Background'].inputs['Color'].default_value = (0.60, 0.72, 0.91, 1)
world.node_tree.nodes['Background'].inputs['Strength'].default_value = 0.45
scene.world = world
preview_mat = material('PREVIEW-ground', (0.105, 0.112, 0.12), 0.86)
bpy.ops.mesh.primitive_plane_add(size=200)
ground = bpy.context.object
ground.name = 'PREVIEW-ground'
ground.location.z = 0
ground.data.materials.append(preview_mat)

def aim(obj, target):
    direction = to_b(target) - obj.location
    obj.rotation_euler = direction.to_track_quat('-Z', 'Y').to_euler()

bpy.ops.object.light_add(type='SUN', location=to_b((4, 10, 9)))
sun = bpy.context.object
sun.name = 'PREVIEW-sun'
sun.data.energy = 2.2
sun.data.angle = math.radians(18)
sun.data.color = (1, 0.90, 0.78)
aim(sun, (0, 0, 0))
for location, power, size, color in [((3, 8, 5), 2200, 8, (0.77, 0.87, 1)),
                                      ((-6, 6, -4), 2500, 7, (0.90, 0.94, 1))]:
    bpy.ops.object.light_add(type='AREA', location=to_b(location))
    light = bpy.context.object
    light.name = 'PREVIEW-softbox'
    light.data.energy = power
    light.data.shape = 'DISK'
    light.data.size = size
    light.data.color = color
    aim(light, (0, 1.8, 0))

bpy.ops.object.camera_add(location=to_b((10.6, 6.3, 12.3)))
camera = bpy.context.object
camera.name = 'PREVIEW-camera'
camera.data.lens = 54
aim(camera, (0, 1.79, 0.2))
scene.camera = camera
scene.render.engine = 'CYCLES'
scene.cycles.samples = 16
scene.cycles.use_denoising = True
scene.cycles.device = 'CPU'
scene.render.threads_mode = 'FIXED'
scene.render.threads = 4
scene.cycles.transparent_max_bounces = 16
scene.render.resolution_x = 1280
scene.render.resolution_y = 900
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = 'PNG'
scene.render.filepath = str(PREVIEW_PATH)
scene.view_settings.view_transform = 'AgX'
scene.view_settings.look = 'AgX - Medium High Contrast'
bpy.ops.wm.save_as_mainfile(filepath=str(BLEND_PATH))
bpy.ops.render.render(write_still=True)
preview_dials = []
preview_face = material('PREVIEW-instrument-face', (0.005, 0.010, 0.013), 0.7)
preview_white = material('PREVIEW-instrument-ink', (0.8, 0.86, 0.83), 0.7, emit=(0.8, 0.86, 0.83))

def preview_text(text, point, size, mat):
    data = bpy.data.curves.new('PREVIEW-gauge-type', 'FONT')
    data.body = text
    data.size = size
    data.align_x = 'CENTER'
    data.align_y = 'CENTER'
    obj = bpy.data.objects.new('PREVIEW-gauge-type', data)
    scene.collection.objects.link(obj)
    obj.location = to_b(point)
    obj.rotation_euler = (math.pi / 2, 0, math.pi)
    obj.data.materials.append(mat)
    preview_dials.append(obj)
    return obj

for key, value in (('gauge_fuel', 0.75), ('gauge_speed', 0)):
    x, y, z = GAUGE_CONTRACT[key]['center']
    r = GAUGE_CONTRACT[key]['radius']
    p = [(x, y, z)] + [(x + r * math.cos(a * math.tau / 48), y + r * math.sin(a * math.tau / 48), z) for a in range(48)]
    f = [(0, 1 + i, 1 + (i + 1) % 48) for i in range(48)]
    obj = mesh('Preview-gauge-face', p, f, preview_face)
    obj.name = 'PREVIEW-gauge-face'
    STATIC.remove(obj)
    preview_dials.append(obj)
    for i in range(27):
        a = math.radians(-130 + i * 10)
        long = i % 4 == 0
        p = [(x + math.sin(a) * r * t, y + math.cos(a) * r * t, z - 0.0009) for t in ((0.78 if long else 0.85), 0.94)]
        obj = tube('Preview-tick', p, 0.0014 if long else 0.0008, preview_white)
        obj.name = 'PREVIEW-tick'
        STATIC.remove(obj)
        preview_dials.append(obj)
    for i in range(7):
        a = math.radians(-130 + i * (260 / 6))
        text = str(i * 20) if key == 'gauge_speed' else ('0', '', '1/4', '1/2', '3/4', '', '1')[i]
        preview_text(text, (x + math.sin(a) * r * 0.65, y + math.cos(a) * r * 0.65, z - 0.001), r * 0.13, preview_white)
    a = math.radians(-130 + value * 260)
    obj = tube('Preview-needle', [(x, y, z - 0.002), (x + math.sin(a) * r * 0.71, y + math.cos(a) * r * 0.71, z - 0.002)], 0.0018, RED)
    obj.name = 'PREVIEW-needle'
    STATIC.remove(obj)
    preview_dials.append(obj)
    preview_text('km/h' if key == 'gauge_speed' else 'L', (x, y - r * 0.40, z - 0.001), r * 0.15, preview_white)
preview_text('0  D', (0.57, 2.549, 3.006), 0.024, preview_white)
preview_text('15:18', (0.57, 2.505, 3.006), 0.013, preview_white)
camera.location = to_b((0.57, 2.88, 1.70))
camera.data.sensor_fit = 'VERTICAL'
camera.data.sensor_height = 24
camera.data.lens = 24 / (2 * math.tan(math.radians(42) / 2))
aim(camera, (0, 0.468, 35))
scene.render.resolution_x = 1280
scene.render.resolution_y = 720
scene.render.filepath = str(BUILD_PROOFS / 'driver-eye.png')
bpy.ops.render.render(write_still=True)
for obj in preview_dials:
    bpy.data.objects.remove(obj, do_unlink=True)
camera.location = to_b((10.6, 6.3, 12.3))
camera.data.sensor_fit = 'AUTO'
camera.data.lens = 54
aim(camera, (0, 1.79, 0.2))
scene.render.resolution_y = 900
scene.render.filepath = str(PREVIEW_PATH)
bpy.ops.wm.save_as_mainfile(filepath=str(BLEND_PATH))

stats = {
    'path': str(MODEL_PATH), 'bytes': MODEL_PATH.stat().st_size, 'triangles': tris,
    'drawcalls': drawcalls, 'bbox_min': minimum, 'bbox_max': maximum,
    'sha256': hashlib.sha256(MODEL_PATH.read_bytes()).hexdigest(),
    'aperture_rays_from_eye': aperture_tests,
    'interior_lining_offset_m': 0.018,
    'removed_degenerate_export_triangles': removed_triangles,
    'materials': [m.name for m in (PAINT, TRIM, RUBBER, STEEL, CHROME, GLASS, MIRROR, LAMP, RED, AMBER, INTERIOR, POLYMER, LEATHER)],
    'nodes': [o.name for o in runtime_objects], 'preview': str(PREVIEW_PATH),
    'glass_alpha_modes': [(m['name'], m.get('alphaMode')) for m in gltf.get('materials', []) if m['name'] == 'MAT-glass'],
    'exported_primitive_count': sum(len(m['primitives']) for m in gltf.get('meshes', []))
}
STATS_PATH.write_text(json.dumps(stats, indent=2), encoding='utf-8')
(BASE / 'tmp/qa/cab-asset-stats.json').write_text(json.dumps(stats, indent=2), encoding='utf-8')
print('TRUCK_ASSET_STATS=' + json.dumps(stats, ensure_ascii=True))
