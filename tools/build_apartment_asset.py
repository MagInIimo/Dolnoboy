import bpy
import bmesh
import math
import json
import struct
import random
import hashlib
import sys
from pathlib import Path
from mathutils import Vector


BASE = Path(__file__).resolve().parents[1]
MODEL_PATH = BASE / 'game/assets/models/apartment.glb'
BLEND_PATH = BASE / 'tmp/assets/apartment.blend'
PREVIEW_PATH = BASE / 'tmp/qa/apartment-preview.png'
STATS_PATH = BASE / 'tmp/qa/apartment-stats.json'
for output in (MODEL_PATH, BLEND_PATH, PREVIEW_PATH, STATS_PATH):
    output.parent.mkdir(parents=True, exist_ok=True)


def build_distance_lod():
    import runpy
    runpy.run_path(str(BASE / "tools/build_apartment_lod.py"), run_name="__main__")


if '--lod-only' in sys.argv:
    build_distance_lod()
    sys.exit(0)

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.context.preferences.filepaths.save_version = 0
scene = bpy.context.scene
scene.unit_settings.system = 'METRIC'
scene.unit_settings.scale_length = 1
random.seed(2761)


def to_b(p):
    return Vector((p[0], -p[2], p[1]))


def to_g(p):
    return (p[0], p[2], -p[1])


def material(tag, color, roughness, metallic=0, coat=0):
    mat = bpy.data.materials.new('MAT-' + tag)
    mat.use_nodes = True
    node = mat.node_tree.nodes.get('Principled BSDF')
    node.inputs['Base Color'].default_value = (*color, 1)
    node.inputs['Roughness'].default_value = roughness
    node.inputs['Metallic'].default_value = metallic
    node.inputs['Coat Weight'].default_value = coat
    node.inputs['Coat Roughness'].default_value = .14
    mat.diffuse_color = (*color, 1)
    return mat


MATERIALS = {
    'facade': material('facade', (.62, .565, .447), .9),
    'trim': material('trim', (.45, .428, .367), .86),
    'concrete': material('concrete', (.30, .306, .285), .96),
    'recess': material('recess', (.065, .072, .068), 1),
    'frame': material('frame', (.36, .385, .347), .63),
    'glass': material('glass', (.095, .145, .162), .14, coat=.7),
    'metal': material('metal', (.40, .435, .419), .62, 1),
    'roof': material('roof', (.135, .159, .148), .72),
}
glass_color = MATERIALS['glass'].node_tree.nodes.new('ShaderNodeVertexColor')
glass_color.layer_name = 'Color'
MATERIALS['glass'].node_tree.links.new(
    glass_color.outputs['Color'],
    MATERIALS['glass'].node_tree.nodes['Principled BSDF'].inputs['Base Color'])


class Surface:
    def __init__(self, tag):
        self.tag = tag
        self.vertices = []
        self.faces = []
        self.colors = []
        self.smooth = []

    def add(self, points, faces, color=(1, 1, 1, 1), smooth=False):
        offset = len(self.vertices)
        self.vertices.extend(points)
        self.faces.extend(tuple(offset + i for i in f) for f in faces)
        self.colors.extend([color] * len(faces))
        self.smooth.extend([smooth] * len(faces))


SURFACES = {name: Surface(name) for name in MATERIALS}


def mesh(tag, points, faces, color=(1, 1, 1, 1), smooth=False):
    SURFACES[tag].add(points, faces, color, smooth)


def quad(tag, points, color=(1, 1, 1, 1)):
    mesh(tag, points, [(0, 1, 2, 3)], color)


def box(tag, pos, size, transform=None, color=(1, 1, 1, 1)):
    x, y, z = pos
    a, b, c = (v / 2 for v in size)
    points = [(x-a, y-b, z-c), (x+a, y-b, z-c), (x+a, y+b, z-c), (x-a, y+b, z-c),
              (x-a, y-b, z+c), (x+a, y-b, z+c), (x+a, y+b, z+c), (x-a, y+b, z+c)]
    if transform:
        points = [transform(*p) for p in points]
    mesh(tag, points, [(0, 3, 2, 1), (4, 5, 6, 7), (0, 1, 5, 4),
                      (3, 7, 6, 2), (0, 4, 7, 3), (1, 2, 6, 5)], color)


def beam(tag, a, b, width, depth=None):
    a, b = Vector(a), Vector(b)
    axis = (b - a).normalized()
    ref = Vector((0, 1, 0)) if abs(axis.y) < .8 else Vector((1, 0, 0))
    u = axis.cross(ref).normalized() * (width / 2)
    v = axis.cross(u).normalized() * ((depth or width) / 2)
    points = [tuple(p + su*u + sv*v) for p in (a, b)
              for su, sv in ((-1, -1), (1, -1), (1, 1), (-1, 1))]
    mesh(tag, points, [(0, 3, 2, 1), (4, 5, 6, 7), (0, 1, 5, 4),
                      (3, 7, 6, 2), (0, 4, 7, 3), (1, 2, 6, 5)])


def pipe(tag, points, radius, segments=8, caps=True):
    points = [Vector(p) for p in points]
    vertices, faces = [], []
    for i, p in enumerate(points):
        axis = (points[min(i+1, len(points)-1)] - points[max(i-1, 0)]).normalized()
        reference = Vector((0, 1, 0)) if abs(axis.y) < .85 else Vector((1, 0, 0))
        u = axis.cross(reference).normalized()
        v = axis.cross(u).normalized()
        for j in range(segments):
            angle = j * math.tau / segments
            vertices.append(tuple(p + radius * (u*math.cos(angle) + v*math.sin(angle))))
        if i:
            for j in range(segments):
                k, n = (i-1)*segments+j, (j+1) % segments
                faces.append((k, (i-1)*segments+n, i*segments+n, i*segments+j))
    if caps:
        faces.append(tuple(range(segments-1, -1, -1)))
        faces.append(tuple((len(points)-1)*segments+j for j in range(segments)))
    mesh(tag, vertices, faces, smooth=True)


def ring(tag, outer, inner, front, back, transform):
    outer_points = [(-outer[0]/2, -outer[1]/2), (outer[0]/2, -outer[1]/2),
                    (outer[0]/2, outer[1]/2), (-outer[0]/2, outer[1]/2)]
    inner_points = [(-inner[0]/2, -inner[1]/2), (inner[0]/2, -inner[1]/2),
                    (inner[0]/2, inner[1]/2), (-inner[0]/2, inner[1]/2)]
    points = [transform(u, y, out) for out in (front, back)
              for loop in (outer_points, inner_points) for u, y in loop]
    faces = []
    for j in range(4):
        k = (j+1) % 4
        faces.extend([(j, k, 4+k, 4+j), (8+j, 12+j, 12+k, 8+k),
                      (j, 8+j, 8+k, k), (4+j, 4+k, 12+k, 12+j)])
    mesh(tag, points, faces)


def rim_between(tag, outer, inner, transform):
    points = [transform(u, y, out) for u, y, out in outer + inner]
    mesh(tag, points, [(j, (j+1) % 4, (j+1) % 4+4, j+4) for j in range(4)])


def perimeter(tag, y, height, projection, thick=.12):
    w, d = 25 + projection*2, 18 + projection*2
    for side in (-1, 1):
        box(tag, (0, y, side*(d/2-thick/2)), (w, height, thick))
        box(tag, (side*(w/2-thick/2), y, 0), (thick, height, d-thick*2))


def facade_transform(yaw, distance):
    co, si = math.cos(yaw), math.sin(yaw)
    return lambda u, y, out: (u*co+(distance+out)*si, y, -u*si+(distance+out)*co)


WINDOW_COUNT = 0
BALCONY_COUNT = 0


def balcony(transform, u, sill, seed):
    global BALCONY_COUNT
    BALCONY_COUNT += 1
    rand = random.Random(seed)
    x0, x1, out0, out1 = u-1.23, u+1.23, -.065, 1.14
    h = sill - .06
    inset = .06
    contour = [(x0+inset, out0), (x1-inset, out0), (x1, out0+inset),
               (x1, out1-inset), (x1-inset, out1), (x0+inset, out1),
               (x0, out1-inset), (x0, out0+inset)]
    points = [transform(x, y, z) for y in (h-.16, h) for x, z in contour]
    faces = [tuple(range(8)), tuple(range(15, 7, -1))]
    faces.extend((j, j+8, (j+1)%8+8, (j+1)%8) for j in range(8))
    mesh('concrete', points, faces)
    for side in (-1, 1):
        a = u+side*.85
        points = [transform(a+dx, yy, zz) for dx in (-.09, .09)
                  for yy, zz in ((h-.10, .03), (h-.54, .03), (h-.13, .61))]
        mesh('trim', points, [(0, 2, 1), (3, 4, 5), (0, 1, 4, 3),
                              (1, 2, 5, 4), (2, 0, 3, 5)])
    box('concrete', (u, h+.22, 1.095), (2.34, .36, .075), transform)
    box('trim', (u, h+.42, 1.095), (2.42, .055, .11), transform)
    box('metal', (u, h+.94, 1.09), (2.43, .04, .043), transform)
    for j in range(11):
        x = u-1.16+j*.232
        box('metal', (x, h+.665, 1.09), (.026, .55, .026), transform)
    for side in (-1, 1):
        x = u+side*1.19
        box('metal', (x, h+.92, .55), (.038, .04, 1.1), transform)
        box('metal', (x, h+.43, .55), (.028, .028, 1.1), transform)
        for out in (.08, .42, .76, 1.09):
            box('metal', (x, h+.64, out), (.027, .59, .027), transform)
    for j in range(5):
        x = u-1.08+rand.random()*2.08
        y = h-.12+rand.random()*.07
        width = .025+rand.random()*.085
        quad('recess', [transform(x, y, out1+.001), transform(x+width, y+.008, out1+.001),
                        transform(x+width*.6, y+.031, out1+.001), transform(x-.006, y+.018, out1+.001)])


def window(transform, u, bottom, width, height, floor, column, facade_index, is_balcony):
    global WINDOW_COUNT
    WINDOW_COUNT += 1
    centre = bottom+height/2
    own = lambda x, y, out: transform(u+x, centre+y, out)
    loop = lambda w, h, out: [(-w/2, -h/2, out), (w/2, -h/2, out),
                             (w/2, h/2, out), (-w/2, h/2, out)]
    rim_between('facade' if floor else 'trim', loop(width, height, 0),
                loop(width-.046, height-.046, -.026), own)
    rim_between('trim', loop(width-.046, height-.046, -.026),
                loop(width-.046, height-.046, -.27), own)
    ring('frame', (width-.07, height-.07), (width-.19, height-.19), -.17, -.275, own)
    ring('trim', (width+.11, height+.11), (width+.025, height+.025), .035, .003, own)
    box('trim', (u, bottom-.018, .078), (width+.22, .092, .40), transform)
    box('metal', (u, bottom+.032, .13), (width+.15, .016, .31), transform)
    box('frame', (u-width*.085, centre, -.202), (.046, height-.19, .069), transform)
    transom = bottom+height*.72
    box('frame', (u, transom, -.203), (width-.19, .043, .066), transform)
    splits_x = [u-width/2+.095, u-width*.085-.024, u-width*.085+.024, u+width/2-.095]
    splits_y = [bottom+.095, transom-.024, transom+.024, bottom+height-.095]
    rand = random.Random(8191+floor*149+column*19+facade_index*641)
    for left, right in ((splits_x[0], splits_x[1]), (splits_x[2], splits_x[3])):
        for low, high in ((splits_y[0], splits_y[1]), (splits_y[2], splits_y[3])):
            color = (.077+rand.random()*.038, .12+rand.random()*.047, .135+rand.random()*.057, 1)
            quad('glass', [transform(left, low, -.278), transform(right, low, -.278),
                           transform(right, high, -.278), transform(left, high, -.278)], color)
    if is_balcony:
        balcony(transform, u, bottom, floor*127+column*71+facade_index*191)


for side, yaw, width, depth, columns in [
        (0, 0, 25, 18, 6), (1, math.pi, 25, 18, 6),
        (2, math.pi/2, 18, 25, 4), (3, -math.pi/2, 18, 25, 4)]:
    transform = facade_transform(yaw, depth/2)
    openings = []
    for floor in range(6):
        for column in range(columns):
            u = (column-(columns-1)/2)*(width-1.48)/columns
            bottom = 1.05 if floor == 0 else 3.77+(floor-1)*3.0
            w, h = (1.72, 2.24) if floor == 0 else (1.56, 2.04)
            is_balcony = floor > 0 and side < 2 and column % 3 == 1
            if is_balcony:
                bottom -= .08
                h += .08
            openings.append((u-w/2, u+w/2, bottom, bottom+h))
            window(transform, u, bottom, w, h, floor, column, side, is_balcony)
    if side in (0, 1):
        openings.append((-1.02, 1.02, .18, 2.83))
    xs = sorted(set([-width/2, width/2]+[x for rect in openings for x in rect[:2]]))
    ys = sorted(set([0, .73, 3.51, 18.60]+[y for rect in openings for y in rect[2:]]))
    for x0, x1 in zip(xs, xs[1:]):
        for y0, y1 in zip(ys, ys[1:]):
            u, y = (x0+x1)/2, (y0+y1)/2
            if any(a < u < b and c < y < d for a, b, c, d in openings):
                continue
            tag = 'concrete' if y < .73 else ('trim' if y < 3.51 else 'facade')
            quad(tag, [transform(x0, y0, 0), transform(x1, y0, 0),
                       transform(x1, y1, 0), transform(x0, y1, 0)])
    if side in (0, 1):
        u, cy = 0, 1.505
        own = lambda x, y, out: transform(x, cy+y, out)
        outer = [(-1.02, -1.325, 0), (1.02, -1.325, 0), (1.02, 1.325, 0), (-1.02, 1.325, 0)]
        inner = [(x, y, -.30) for x, y, _ in outer]
        rim_between('trim', outer, inner, own)
        ring('roof', (2.00, 2.59), (1.82, 2.41), -.20, -.30, own)
        box('roof', (0, 1.46, -.241), (.057, 2.40, .09), transform)
        box('roof', (0, 2.40, -.243), (1.88, .051, .085), transform)
        box('roof', (0, .67, -.252), (1.9, .97, .052), transform)
        for half in (-1, 1):
            x0, x1 = (-.9, -.033) if half < 0 else (.033, .9)
            quad('glass', [transform(x0, 1.17, -.286), transform(x1, 1.17, -.286),
                           transform(x1, 2.37, -.286), transform(x0, 2.37, -.286)], (.082, .13, .151, 1))
            box('metal', (half*.14, 1.53, -.173), (.035, .31, .036), transform)
        quad('glass', [transform(-.9, 2.43, -.286), transform(.9, 2.43, -.286),
                       transform(.9, 2.72, -.286), transform(-.9, 2.72, -.286)], (.077, .122, .146, 1))
        for i in range(3):
            box('concrete', (0, .035+i*.06, .51-i*.19), (2.35, .07+i*.12, 1.28-i*.38), transform)
        box('trim', (0, 2.91, .57), (3.20, .12, 1.42), transform)
        box('roof', (0, 2.985, .59), (3.26, .034, 1.46), transform)
        for dx in (-1.36, 1.36):
            beam('metal', transform(dx, 2.97, 1.22), transform(dx, 3.48, -.02), .025)
            beam('metal', transform(dx, 2.81, .97), transform(dx, 2.72, .03), .043)
        box('recess', (-1.36, 1.59, .025), (.21, .38, .043), transform)
        box('metal', (-1.36, 1.58, .055), (.16, .31, .017), transform)
        for i in range(4):
            box('frame', (-1.36, 1.66-i*.043, .07), (.075, .012, .009), transform)
    for u in (-width/2+.55, width/2-.55):
        if side > 1:
            continue
        path = [transform(u, .28, .30), transform(u, .40, .14),
                transform(u, 17.85, .14), transform(u, 18.3, .33), transform(u, 18.68, .36)]
        pipe('metal', path, .055, 8)
        for y in (1.0, 3.5, 6, 8.5, 11, 13.5, 16, 17.7):
            box('metal', (u, y, .13), (.14, .045, .09), transform)
    for j in range(int(width/1.7)):
        u = -width/2+(j+1)*1.7
        box('recess', (u, .36, .002), (.006, .66, .007), transform)


perimeter('trim', .74, .085, .075)
perimeter('trim', 3.49, .12, .075)
perimeter('trim', 3.60, .065, .10)
perimeter('trim', 9.69, .065, .045)
perimeter('facade', 18.12, .27, .055)
perimeter('trim', 18.31, .095, .125)
perimeter('trim', 18.49, .22, .225)
perimeter('trim', 18.70, .135, .285)
perimeter('roof', 18.83, .065, .32)

for x in (-12.49, 12.49):
    for z in (-8.99, 8.99):
        box('trim', (x, 10.73, z), (.082, 14.35, .082))


EAVE = 18.95
RIDGE = 20.08
ROOF_X = 12.84
ROOF_Z = 9.34
RIDGE_X = 6.8


def roof_y(x, z):
    slope = max(abs(z)/ROOF_Z, max(0, (abs(x)-RIDGE_X)/(ROOF_X-RIDGE_X)))
    return RIDGE-(RIDGE-EAVE)*slope


roof_points = [(-ROOF_X, EAVE, ROOF_Z), (ROOF_X, EAVE, ROOF_Z),
               (ROOF_X, EAVE, -ROOF_Z), (-ROOF_X, EAVE, -ROOF_Z),
               (-RIDGE_X, RIDGE, 0), (RIDGE_X, RIDGE, 0)]
mesh('roof', roof_points, [(0, 1, 5, 4), (2, 3, 4, 5), (1, 2, 5), (3, 0, 4)])
for sign in (-1, 1):
    for j in range(43):
        x = -ROOF_X+.22+j*(ROOF_X*2-.44)/42
        end_z = max(0, (abs(x)-RIDGE_X)/(ROOF_X-RIDGE_X)*ROOF_Z)
        a, b = (x, EAVE+.025, sign*ROOF_Z), (x, roof_y(x, end_z)+.025, sign*end_z)
        beam('roof', a, b, .032, .050)
    for j in range(19):
        z = -ROOF_Z+.36+j*(ROOF_Z*2-.72)/18
        end_x = RIDGE_X+(abs(z)/ROOF_Z)*(ROOF_X-RIDGE_X)
        beam('roof', (sign*ROOF_X, EAVE+.025, z),
             (sign*end_x, roof_y(end_x, z)+.025, z), .032, .050)
beam('metal', (-RIDGE_X, RIDGE+.025, 0), (RIDGE_X, RIDGE+.025, 0), .075, .044)
for p, q in [(roof_points[0], roof_points[4]), (roof_points[1], roof_points[5]),
             (roof_points[2], roof_points[5]), (roof_points[3], roof_points[4])]:
    beam('roof', (p[0], p[1]+.025, p[2]), (q[0], q[1]+.025, q[2]), .065, .043)
for sign in (-1, 1):
    pipe('metal', [(-ROOF_X, 18.86, sign*9.29), (ROOF_X, 18.86, sign*9.29)], .070, 8)
    pipe('metal', [(sign*12.80, 18.86, -ROOF_Z), (sign*12.80, 18.86, ROOF_Z)], .070, 8)
    for x in (-10.5, -7, -3.5, 0, 3.5, 7, 10.5):
        beam('metal', (x, 18.81, sign*9.21), (x, 18.91, sign*9.36), .023)

for x, z in ((-7.1, 2.3), (7.1, 2.3), (-7.1, -3.2), (7.1, -3.2)):
    y = roof_y(x, z)
    box('roof', (x, y+.02, z), (1.45, .065, 1.07))
    box('trim', (x, y+.56, z), (1.00, 1.13, .72))
    box('recess', (x, y+.93, z+.367), (.76, .19, .016))
    for j in range(3):
        box('metal', (x, y+.87+j*.055, z+.378), (.81, .017, .055))
    box('concrete', (x, y+1.12, z), (1.18, .09, .86))
    box('roof', (x, y+1.21, z), (1.32, .055, .98))
for x, z in ((-2, -3.2), (3.3, 2.7), (5.7, -.7)):
    y = roof_y(x, z)
    box('roof', (x, y+.02, z), (.75, .05, .75))
    pipe('metal', [(x, y-.025, z), (x, y+.51, z)], .125, 10)
    pipe('roof', [(x, y+.54, z), (x, y+.60, z)], .245, 12)
    pipe('metal', [(x, y+.36, z), (x, y+.49, z)], .149, 10)

mast_x, mast_z = -4.6, -.7
mast_y = roof_y(mast_x, mast_z)
pipe('metal', [(mast_x, mast_y, mast_z), (mast_x, 21.87, mast_z)], .026, 6)
beam('metal', (mast_x-.75, mast_y+.045, mast_z-.4), (mast_x, 20.75, mast_z), .022)
beam('metal', (mast_x+.75, mast_y+.045, mast_z+.4), (mast_x, 20.75, mast_z), .022)
beam('metal', (mast_x-.73, 21.39, mast_z), (mast_x+.73, 21.39, mast_z), .027)
for i, length in enumerate((1.13, 1.03, .92, .82, .69)):
    x = mast_x-.58+i*.29
    beam('metal', (x, 21.39, mast_z-length/2), (x, 21.39, mast_z+length/2), .015)

runtime_objects = []
triangle_total = 0
for tag, surface in SURFACES.items():
    data = bpy.data.meshes.new('MESH-' + tag)
    data.from_pydata([to_b(p) for p in surface.vertices], [], surface.faces)
    data.update()
    uv = data.uv_layers.new(name='UVMap')
    colors = data.color_attributes.new(name='Color', type='FLOAT_COLOR', domain='CORNER')
    for face, color, smooth in zip(data.polygons, surface.colors, surface.smooth):
        face.use_smooth = smooth
        normal = to_g(face.normal)
        axis = max(range(3), key=lambda i: abs(normal[i]))
        for loop_index in face.loop_indices:
            p = surface.vertices[data.loops[loop_index].vertex_index]
            coord = (p[0], p[2]) if axis == 1 else ((p[2], p[1]) if axis == 0 else (p[0], p[1]))
            uv.data[loop_index].uv = (coord[0]/3.0, coord[1]/3.0)
            colors.data[loop_index].color = color
    data.color_attributes.active_color = colors
    obj = bpy.data.objects.new('GEO-' + tag, data)
    scene.collection.objects.link(obj)
    data.materials.append(MATERIALS[tag])
    data.calc_loop_triangles()
    triangle_total += len(data.loop_triangles)
    runtime_objects.append(obj)

assert WINDOW_COUNT == 120, WINDOW_COUNT
assert BALCONY_COUNT == 20, BALCONY_COUNT
assert triangle_total <= 35000, triangle_total
assert len(runtime_objects) <= 12, len(runtime_objects)
points = [to_g(obj.matrix_world @ v.co) for obj in runtime_objects for v in obj.data.vertices]
bounds_min = [min(p[i] for p in points) for i in range(3)]
bounds_max = [max(p[i] for p in points) for i in range(3)]
assert abs(bounds_min[1]) < .001, bounds_min

bpy.ops.object.select_all(action='DESELECT')
for obj in runtime_objects:
    obj.select_set(True)
bpy.context.view_layer.objects.active = runtime_objects[0]
bpy.ops.export_scene.gltf(filepath=str(MODEL_PATH), export_format='GLB', use_selection=True,
                          export_apply=True, export_yup=True, export_materials='EXPORT',
                          export_animations=False, export_skins=False, export_morph=False,
                          export_normals=True, export_texcoords=True, export_tangents=False,
                          export_cameras=False, export_lights=False, export_extras=False)
blob = MODEL_PATH.read_bytes()
json_length, json_type = struct.unpack_from('<II', blob, 12)
gltf = json.loads(blob[20:20+json_length])
gltf['asset']['generator'] = 'glTF 2.0'
encoded = json.dumps(gltf, separators=(',', ':'), ensure_ascii=True).encode('utf8')
encoded += b' ' * ((-len(encoded)) % 4)
tail = blob[20+json_length:]
MODEL_PATH.write_bytes(struct.pack('<III', 0x46546C67, 2, 20+len(encoded)+len(tail))
                       + struct.pack('<II', len(encoded), 0x4E4F534A) + encoded + tail)
assert not gltf.get('images'), 'Runtime GLB should reference no texture images'
primitive_count = sum(len(m['primitives']) for m in gltf.get('meshes', []))
assert primitive_count <= 12, primitive_count


def preview_texture(tag, name, color):
    mat = MATERIALS[tag]
    nodes, links = mat.node_tree.nodes, mat.node_tree.links
    bsdf = nodes['Principled BSDF']
    texcoord = nodes.new('ShaderNodeTexCoord')
    diffuse = nodes.new('ShaderNodeTexImage')
    filename = next((BASE/'game/assets'/name).glob('*diff*jpg'))
    diffuse.image = bpy.data.images.load(str(filename))
    links.new(texcoord.outputs['UV'], diffuse.inputs['Vector'])
    tint = nodes.new('ShaderNodeMixRGB')
    tint.blend_type = 'MULTIPLY'
    tint.inputs[0].default_value = 1
    tint.inputs[2].default_value = (*color, 1)
    links.new(diffuse.outputs['Color'], tint.inputs[1])
    links.new(tint.outputs[0], bsdf.inputs['Base Color'])
    normal_file = next((BASE/'game/assets'/name).glob('*nor_gl*jpg'))
    normal_texture = nodes.new('ShaderNodeTexImage')
    normal_texture.image = bpy.data.images.load(str(normal_file))
    normal_texture.image.colorspace_settings.name = 'Non-Color'
    links.new(texcoord.outputs['UV'], normal_texture.inputs['Vector'])
    normal = nodes.new('ShaderNodeNormalMap')
    normal.inputs['Strength'].default_value = .45
    links.new(normal_texture.outputs['Color'], normal.inputs['Color'])
    links.new(normal.outputs['Normal'], bsdf.inputs['Normal'])


preview_texture('facade', 'plastered_wall', (.79, .715, .56))
preview_texture('trim', 'plastered_wall', (.53, .52, .475))
preview_texture('concrete', 'concrete_floor_02', (.50, .52, .50))
world = bpy.data.worlds.new('Preview-daylight')
world.use_nodes = True
world.node_tree.nodes.clear()
output = world.node_tree.nodes.new('ShaderNodeOutputWorld')
background = world.node_tree.nodes.new('ShaderNodeBackground')
background.inputs['Strength'].default_value = .36
environment = world.node_tree.nodes.new('ShaderNodeTexEnvironment')
environment.image = bpy.data.images.load(str(BASE/'game/assets/kloofendal_38d_partly_cloudy_puresky/kloofendal_38d_partly_cloudy_puresky_1k.hdr'))
world.node_tree.links.new(environment.outputs['Color'], background.inputs['Color'])
world.node_tree.links.new(background.outputs[0], output.inputs['Surface'])
scene.world = world


def aim(obj, target):
    obj.rotation_euler = (to_b(target)-obj.location).to_track_quat('-Z', 'Y').to_euler()


bpy.ops.object.light_add(type='SUN', location=to_b((-20, 32, 21)))
sun = bpy.context.object
sun.name = 'LGT-preview-sun'
sun.data.energy = 2.3
sun.data.angle = math.radians(1.2)
sun.data.color = (1, .91, .76)
aim(sun, (0, 5, 0))
bpy.ops.mesh.primitive_plane_add(size=170, location=to_b((0, -.025, 0)))
ground = bpy.context.object
ground.name = 'GEO-preview-ground'
ground.data.materials.append(material('preview-ground', (.26, .27, .25), .92))
bpy.ops.object.camera_add(location=to_b((36, 20.4, 45)))
camera = bpy.context.object
camera.name = 'CAM-preview'
camera.data.lens = 54
aim(camera, (0, 10.2, 0))
scene.camera = camera
scene.render.engine = 'CYCLES'
scene.cycles.samples = 24
scene.cycles.use_denoising = True
scene.cycles.device = 'CPU'
scene.render.threads_mode = 'FIXED'
scene.render.threads = 4
scene.render.resolution_x = 1280
scene.render.resolution_y = 1000
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = 'PNG'
scene.render.filepath = str(PREVIEW_PATH)
scene.view_settings.view_transform = 'AgX'
scene.view_settings.look = 'AgX - Medium High Contrast'
for area in bpy.context.screen.areas:
    if area.type == 'VIEW_3D':
        area.spaces.active.shading.type = 'MATERIAL'
bpy.ops.wm.save_as_mainfile(filepath=str(BLEND_PATH))

stats = {
    'path': str(MODEL_PATH), 'bytes': MODEL_PATH.stat().st_size,
    'sha256': hashlib.sha256(MODEL_PATH.read_bytes()).hexdigest(),
    'triangles': triangle_total, 'drawcalls': primitive_count,
    'bbox_min': bounds_min, 'bbox_max': bounds_max,
    'core_dimensions': [25, 18.6, 18], 'floor_count': 6,
    'window_count': WINDOW_COUNT, 'balcony_count': BALCONY_COUNT,
    'window_recess_m': .278, 'balcony_projection_m': 1.14,
    'materials': [mat.name for mat in MATERIALS.values()],
    'nodes': [obj.name for obj in runtime_objects], 'embedded_images': len(gltf.get('images', [])),
    'preview': str(PREVIEW_PATH),
    'primitives': [{
        'name': m['name'], 'triangles': sum(gltf['accessors'][p['indices']]['count']//3 for p in m['primitives']),
        'attributes': sorted(m['primitives'][0]['attributes']),
    } for m in gltf.get('meshes', [])],
}
STATS_PATH.write_text(json.dumps(stats, indent=2), encoding='utf8')
print('APARTMENT_ASSET_STATS=' + json.dumps(stats, ensure_ascii=True), flush=True)
bpy.ops.render.render(write_still=True)
build_distance_lod()
