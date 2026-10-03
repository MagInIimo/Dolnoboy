# Generates the traffic vehicles as one GLB (game frame: +y up, +z forward, +x left):
#   python cars.py <out.glb> [preview.png]
# Bodies are lofted from cross-sections, smoothed with subdivision, wheel arches are cut with
# booleans, window glass gets an inset black frame and lamps/grilles/plates are projected onto the
# surface. Each kind is exported twice: '<kind>' (near, wheels separate so they can spin) and
# '<kind>_lo' (far, wheels merged). Materials are named 'car_<role>' and remapped in the game.
import os, sys, math, json, time, bpy, bmesh
from mathutils import Vector
from mathutils.bvhtree import BVHTree

ARGS = [a for a in sys.argv if a.endswith('.glb') or a.endswith('.png')]
OUT = next((a for a in ARGS if a.endswith('.glb')), 'cars.glb')
PREVIEW = next((a for a in ARGS if a.endswith('.png')), None)
ONLY = next((a.split('=')[1] for a in sys.argv if a.startswith('only=')), None)

bpy.ops.wm.read_factory_settings(use_empty=True)
SC = bpy.context.scene


def V(p):  # game -> Blender
    return Vector((p[0], -p[2], p[1]))


def G(v):  # Blender -> game
    return Vector((v.x, v.z, -v.y))


# ---------- materials (one fixed list so indices agree across meshes) ----------
MDEF = {
    'paint': ((0.55, 0.06, 0.05), 0.3, 0.3),
    'glass': ((0.02, 0.025, 0.03), 0.03, 0.0),
    'trim': ((0.015, 0.015, 0.017), 0.25, 0.0),
    'plastic': ((0.035, 0.035, 0.038), 0.65, 0.0),
    'grille': ((0.012, 0.012, 0.012), 0.45, 0.0),
    'chrome': ((0.75, 0.75, 0.77), 0.12, 1.0),
    'under': ((0.02, 0.02, 0.02), 0.9, 0.0),
    'arch': ((0.012, 0.012, 0.012), 0.95, 0.0),
    'tyre': ((0.03, 0.03, 0.03), 0.88, 0.0),
    'rim': ((0.62, 0.63, 0.65), 0.3, 0.85),
    'rimdark': ((0.03, 0.03, 0.035), 0.6, 0.2),
    'steel': ((0.32, 0.33, 0.34), 0.45, 0.5),
    'plate': ((0.82, 0.82, 0.8), 0.5, 0.0),
    'white': ((0.82, 0.83, 0.82), 0.45, 0.0),
    'box': ((0.86, 0.87, 0.87), 0.5, 0.1),
    'blue': ((0.03, 0.13, 0.45), 0.35, 0.1),
    'seam': ((0.01, 0.01, 0.01), 0.8, 0.0),
    'head': ((0.75, 0.77, 0.8), 0.08, 0.6),
    'tail': ((0.45, 0.02, 0.02), 0.12, 0.1),
    'amber': ((0.7, 0.35, 0.03), 0.12, 0.1),
    'beacon_blue': ((0.05, 0.12, 0.6), 0.2, 0.0),
    'beacon_red': ((0.6, 0.03, 0.03), 0.2, 0.0),
    'marker': ((0.7, 0.35, 0.03), 0.15, 0.1),
    'alu': ((0.62, 0.64, 0.66), 0.35, 0.8),
}
MLIST = list(MDEF)
MATS = {}
for name, (rgb, rough, metal) in MDEF.items():
    m = bpy.data.materials.new('car_' + name)
    m.use_nodes = True
    b = m.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = (*rgb, 1)
    b.inputs['Roughness'].default_value = rough
    b.inputs['Metallic'].default_value = metal
    MATS[name] = m


def mi(name):
    return MLIST.index(name)


class Buf:
    """Vertices (game frame) + faces with material names; creases on vertex pairs."""

    def __init__(self):
        self.v, self.f, self.m = [], [], []
        self.crease = {}

    def add(self, p):
        self.v.append(Vector(p))
        return len(self.v) - 1

    def face(self, idx, mname):
        self.f.append(list(idx))
        self.m.append(mi(mname))

    def mesh(self, name):
        me = bpy.data.meshes.new(name)
        me.from_pydata([V(p) for p in self.v], [], self.f)
        for n in MLIST:
            me.materials.append(MATS[n])
        for i, poly in enumerate(me.polygons):
            poly.material_index = self.m[i]
            poly.use_smooth = True
        if self.crease:
            attr = me.attributes.new('crease_edge', 'FLOAT', 'EDGE')
            for e in me.edges:
                c = self.crease.get(frozenset(e.vertices))
                if c:
                    attr.data[e.index].value = c
        me.update()
        return me


def new_obj(name, me):
    o = bpy.data.objects.new(name, me)
    SC.collection.objects.link(o)
    return o


def bake(obj):
    """Applies the modifier stack into a new mesh."""
    dg = bpy.context.evaluated_depsgraph_get()
    me = bpy.data.meshes.new_from_object(obj.evaluated_get(dg))
    obj.modifiers.clear()
    old = obj.data
    obj.data = me
    bpy.data.meshes.remove(old)
    return me


def fix_normals(me, flip=False):
    bm = bmesh.new()
    bm.from_mesh(me)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    if flip:
        for f in bm.faces:
            f.normal_flip()
    bm.to_mesh(me)
    bm.free()


# ---------- body loft ----------
def ring_half(car, row):
    hw = car['hw'] * row.get('w', 1.0)
    bot, belt, top = row['bot'], row['belt'], row['top']
    g = row.get('gh', 0.0)
    tu = row.get('tu', car.get('tu', 0.80))
    rail = row.get('rail', car.get('rail', 0.10))
    L = lambda a, b: a + (b - a) * g
    side = belt - bot
    return [
        (0.0, bot),
        (0.84 * hw, bot),
        (0.97 * hw, bot + min(0.1, 0.25 * side)),
        (hw, bot + 0.38 * side),
        (0.995 * hw, bot + 0.78 * side),
        (0.955 * hw, belt),
        (L(0.90, min(0.95, tu + 0.13)) * hw, belt + L(0.012, 0.03)),
        (L(0.80, tu) * hw, L(belt + 0.35 * (top - belt), top - rail)),
        (L(0.70, tu - 0.06) * hw, L(belt + 0.55 * (top - belt), top - 0.035)),
        (L(0.40, 0.45) * hw, L(belt + 0.9 * (top - belt), top - 0.005)),
        (0.0, top),
    ]


HALF = 11
FULL = 2 * HALF - 2


def half_index(j):
    return j if j < HALF else FULL - j


def loft(car, rows):
    """Body shell from cross-sections ordered front to rear. Row flags describe the segment to the next row:
    side 'G' glass / 'T' black trim / 'P' paint, top 'W' wide glass / 'R' white roof / 'P' paint."""
    b = Buf()
    rings = []
    for row in rows:
        h = ring_half(car, row)
        full = [(x, y) for x, y in h] + [(-x, y) for x, y in reversed(h[1:-1])]
        rings.append([b.add((x, y, row['z'])) for x, y in full])
    for i in range(len(rows) - 1):
        row = rows[i]
        for j in range(FULL):
            j2 = (j + 1) % FULL
            band = min(half_index(j), half_index(j2))
            if half_index(j) == 0 and half_index(j2) == 0:
                band = 0
            m = 'paint'
            if band == 0:
                m = 'under'
            elif band == 6:
                m = {'G': 'glass', 'T': 'trim'}.get(row.get('side', 'P'), 'paint')
            elif band in (8, 9):
                top = row.get('top_f', 'P')
                m = 'glass' if top == 'W' else 'white' if top == 'R' else 'paint'
            b.face([rings[i][j], rings[i][j2], rings[i + 1][j2], rings[i + 1][j]], m)
    b.face(rings[0], 'paint')
    b.face(list(reversed(rings[-1])), 'paint')
    cap = car.get('cap', 0.5)
    for rg in (rings[0], rings[-1]):
        for j in range(FULL):
            b.crease[frozenset((rg[j], rg[(j + 1) % FULL]))] = cap
    # creases: chosen stations across the top, chosen longitudinal lines
    for i, row in enumerate(rows):
        c = row.get('crease', 0)
        if c:
            for j in range(FULL):
                j2 = (j + 1) % FULL
                if min(half_index(j), half_index(j2)) >= 5:
                    b.crease[frozenset((rings[i][j], rings[i][j2]))] = c
    for k, c in car.get('lcrease', {1: 0.9, 5: 0.6}).items():
        for j in (k, FULL - k):
            for i in range(len(rows) - 1):
                b.crease[frozenset((rings[i][j], rings[i + 1][j]))] = c
    return b


def cylinder_x(b, cx, cy, cz, r, half_len, mname, segs=24):
    """Closed cylinder along x (for boolean cutters)."""
    a0 = [b.add((cx - half_len, cy + r * math.cos(2 * math.pi * k / segs), cz + r * math.sin(2 * math.pi * k / segs))) for k in range(segs)]
    a1 = [b.add((cx + half_len, cy + r * math.cos(2 * math.pi * k / segs), cz + r * math.sin(2 * math.pi * k / segs))) for k in range(segs)]
    for k in range(segs):
        k2 = (k + 1) % segs
        b.face([a0[k], a0[k2], a1[k2], a1[k]], mname)
    b.face(list(reversed(a0)), mname)
    b.face(a1, mname)


def make_body(name, car, rows, arches, level):
    body = new_obj(name, loft(car, rows).mesh(name))
    fix_normals(body.data)
    sub = body.modifiers.new('sub', 'SUBSURF')
    sub.levels = level
    sub.render_levels = level
    if arches:
        cb = Buf()
        for (z, y, r, half) in arches:
            cylinder_x(cb, 0, y, z, r, half, 'arch', 28)
        cut = new_obj(name + '_cut', cb.mesh(name + '_cut'))
        fix_normals(cut.data)
        cut.hide_render = True
        bo = body.modifiers.new('arch', 'BOOLEAN')
        bo.operation = 'DIFFERENCE'
        bo.solver = 'EXACT'
        bo.object = cut
        bo.material_mode = 'TRANSFER'
    bake(body)
    if arches:
        bpy.data.objects.remove(cut)
    return body


def inset_glass(me, thickness=0.018, depth=0.005):
    bm = bmesh.new()
    bm.from_mesh(me)
    gi = mi('glass')
    faces = [f for f in bm.faces if f.material_index == gi]
    if faces:
        res = bmesh.ops.inset_region(bm, faces=faces, thickness=thickness, depth=-depth, use_even_offset=True, use_boundary=True)
        for f in res['faces']:
            f.material_index = mi('trim')
    bm.to_mesh(me)
    bm.free()


def remap_materials(me):
    """Make sure the mesh uses the fixed list (the boolean may have appended slots)."""
    names = [m.name[4:] if m else 'paint' for m in me.materials]
    if names == MLIST:
        return
    idx = [mi(n) if n in MDEF else 0 for n in names]
    for p in me.polygons:
        p.material_index = idx[p.material_index] if p.material_index < len(idx) else 0
    me.materials.clear()
    for n in MLIST:
        me.materials.append(MATS[n])


class Surface:
    def __init__(self, obj):
        me = obj.data
        self.bvh = BVHTree.FromPolygons([v.co.copy() for v in me.vertices], [p.vertices[:] for p in me.polygons])

    def hit(self, p, d, lift):
        o = V(Vector(p) - d * 4.0)
        db = V(d)
        loc, nor, _, _ = self.bvh.ray_cast(o, db, 12.0)
        if loc is None:
            return None
        return G(loc + nor * lift)


def decal(b, surf, pts, d, mname, rings=2, lift=0.006):
    """Projects a star-shaped outline (game frame points) along direction d (into the body)."""
    d = Vector(d).normalized()
    pts = [Vector(p) for p in pts]
    c = sum(pts, Vector()) / len(pts)
    n = len(pts)
    grid = [[surf.hit(c, d, lift)]]
    for r in range(1, rings + 1):
        grid.append([surf.hit(c + (p - c) * (r / rings), d, lift) for p in pts])
    if grid[0][0] is None:
        return
    # drop points that went through a hole and landed on a far surface
    ref = c - d * 4.0
    dist = sorted((p - ref).length for ring in grid for p in ring if p is not None)
    med = dist[len(dist) // 2]
    grid = [[p if p is not None and (p - ref).length < med + 0.25 else None for p in ring] for ring in grid]
    if grid[0][0] is None:
        return
    # orientation: face normals must point back toward the viewer (-d)
    flip = False
    for k in range(n):
        a, p1, p2 = grid[0][0], grid[1][k], grid[1][(k + 1) % n]
        if p1 is not None and p2 is not None:
            nrm = (p1 - a).cross(p2 - a)
            if nrm.length > 1e-9:
                flip = nrm.dot(-d) < 0
                break
    ids = [[None if p is None else b.add(p) for p in ring] for ring in grid]
    c0 = ids[0][0]
    for r in range(1, rings + 1):
        for k in range(n):
            k2 = (k + 1) % n
            if r == 1:
                f = [c0, ids[1][k], ids[1][k2]]
            else:
                f = [ids[r - 1][k], ids[r][k], ids[r][k2], ids[r - 1][k2]]
            if any(i is None for i in f):
                continue
            b.face(list(reversed(f)) if flip else f, mname)


def strip(b, surf, side, z0, z1, y0, y1, mname, nu=24, nv=3, lift=0.006):
    """Rectangular decal on a side of the body (side=+1 left, -1 right), as a grid so long strips follow the surface."""
    d = Vector((-side, 0, 0))
    grid = [[surf.hit((side * 3.0, y0 + (y1 - y0) * j / nv, z0 + (z1 - z0) * i / nu), d, lift) for j in range(nv + 1)] for i in range(nu + 1)]
    for i in range(nu):
        for j in range(nv):
            f = [grid[i][j], grid[i + 1][j], grid[i + 1][j + 1], grid[i][j + 1]]
            if any(p is None for p in f):
                continue
            # skip faces that fell into a wheel arch (landed deep inside the body)
            if any(abs(p.x) < abs(f[0].x) - 0.25 or abs(p.x) < 0.3 for p in f):
                continue
            ids = [b.add(p) for p in f]
            nrm = (f[1] - f[0]).cross(f[3] - f[0])
            b.face(ids if nrm.dot(-d) > 0 else list(reversed(ids)), mname)


def front_grid(b, surf, end, x0, x1, y0, y1, mname, nu=12, nv=3, lift=0.006, zmax=9.0):
    """Rectangular decal on the front (end=+1) or rear (end=-1)."""
    d = Vector((0, 0, -end))
    grid = [[surf.hit((x0 + (x1 - x0) * i / nu, y0 + (y1 - y0) * j / nv, end * zmax), d, lift) for j in range(nv + 1)] for i in range(nu + 1)]
    for i in range(nu):
        for j in range(nv):
            f = [grid[i][j], grid[i + 1][j], grid[i + 1][j + 1], grid[i][j + 1]]
            if any(p is None for p in f):
                continue
            ids = [b.add(p) for p in f]
            nrm = (f[1] - f[0]).cross(f[3] - f[0])
            b.face(ids if nrm.dot(-d) > 0 else list(reversed(ids)), mname)


def slanted(cx, cy, w, h, r, slope, z):
    """Rounded rectangle sheared vertically (lamps that rise toward the car's corners)."""
    return [(x, y + (x - cx) * slope, zz) for x, y, zz in rrect(cx, cy, w, h, r, 3, 'xy', z)]


def arch_flare(b, surf, z, y, r0, r1, side, mname='plastic', segs=14, lift=0.006):
    """Band around a wheel arch on one side (side=+1 left, -1 right)."""
    d = Vector((-side, 0, 0))
    rows = []
    for rr in (r0, (r0 + r1) / 2, r1):
        row = []
        for k in range(segs + 1):
            a = math.radians(-12 + 204 * k / segs)
            row.append(surf.hit((side * 3.0, y + math.sin(a) * rr, z + math.cos(a) * rr), d, lift))
        rows.append(row)
    for i in range(2):
        for k in range(segs):
            f = [rows[i][k], rows[i][k + 1], rows[i + 1][k + 1], rows[i + 1][k]]
            if any(p is None for p in f):
                continue
            ids = [b.add(p) for p in f]
            nrm = (f[1] - f[0]).cross(f[3] - f[0])
            b.face(ids if nrm.dot(-d) > 0 else list(reversed(ids)), mname)


def rrect(cx, cy, w, h, r, n=4, plane='xy', at=0.0):
    """Rounded rectangle outline centred at (cx, cy) in a plane: 'xy' (front/rear, z=at) or 'zy' (side, x=at)."""
    pts = []
    r = min(r, w / 2 - 1e-4, h / 2 - 1e-4)
    for qx, qy, a0 in ((1, 1, 0), (-1, 1, 90), (-1, -1, 180), (1, -1, 270)):
        ox, oy = cx + qx * (w / 2 - r), cy + qy * (h / 2 - r)
        for k in range(n + 1):
            a = math.radians(a0 + 90 * k / n)
            pts.append((ox + math.cos(a) * r, oy + math.sin(a) * r))
    if plane == 'xy':
        return [(x, y, at) for x, y in pts]
    return [(at, y, x) for x, y in pts]


def poly(pts2, plane='xy', at=0.0):
    if plane == 'xy':
        return [(x, y, at) for x, y in pts2]
    return [(at, y, z) for z, y in pts2]


def mirror_x(pts):
    return [(-p[0], p[1], p[2]) for p in pts]


def box(b, c, s, mname, faces='all'):
    x, y, z = c
    hx, hy, hz = s[0] / 2, s[1] / 2, s[2] / 2
    v = [b.add((x + sx * hx, y + sy * hy, z + sz * hz)) for sx in (-1, 1) for sy in (-1, 1) for sz in (-1, 1)]
    # index = (sx>0)*4 + (sy>0)*2 + (sz>0)
    quads = [(0, 1, 3, 2), (4, 6, 7, 5), (0, 4, 5, 1), (2, 3, 7, 6), (0, 2, 6, 4), (1, 5, 7, 3)]
    for q in quads:
        b.face([v[i] for i in q], mname)


def blob(b, c, s, mname, back=None, segs=8, rings=6):
    """Ellipsoid-ish rounded body (mirror housings); faces pointing to -z get material 'back'."""
    x0, y0, z0 = c
    top = b.add((x0, y0 + s[1], z0))
    bot = b.add((x0, y0 - s[1], z0))
    prev = None
    rows = []
    for r in range(1, rings):
        t = math.pi * r / rings
        row = []
        for k in range(segs):
            a = 2 * math.pi * k / segs
            # superellipse for a boxier look
            ca, sa, ct, st = math.cos(a), math.sin(a), math.cos(t), math.sin(t)
            f = lambda u: math.copysign(abs(u) ** 0.6, u)
            row.append(b.add((x0 + s[0] * f(st) * f(ca), y0 + s[1] * f(ct), z0 + s[2] * f(st) * f(sa))))
        rows.append(row)
    for k in range(segs):
        k2 = (k + 1) % segs
        b.face([top, rows[0][k2], rows[0][k]], mname)
        b.face([bot, rows[-1][k], rows[-1][k2]], mname)
    for r in range(len(rows) - 1):
        for k in range(segs):
            k2 = (k + 1) % segs
            a = 2 * math.pi * (k + 0.5) / segs
            m = back if back and math.sin(a) < -0.6 and 0 < r < len(rows) - 2 else mname
            b.face([rows[r][k], rows[r][k2], rows[r + 1][k2], rows[r + 1][k]], m)


def tube(b, pts, r, mname, segs=6):
    """Square-ish tube along a polyline (roof rails, bars)."""
    rings = []
    for i, p in enumerate(pts):
        p = Vector(p)
        a = Vector(pts[max(0, i - 1)])
        c = Vector(pts[min(len(pts) - 1, i + 1)])
        t = (c - a).normalized()
        up = Vector((0, 1, 0)) if abs(t.y) < 0.9 else Vector((1, 0, 0))
        n1 = t.cross(up).normalized()
        n2 = n1.cross(t).normalized()
        rings.append([b.add(p + (n1 * math.cos(2 * math.pi * k / segs) + n2 * math.sin(2 * math.pi * k / segs)) * r) for k in range(segs)])
    for i in range(len(rings) - 1):
        for k in range(segs):
            k2 = (k + 1) % segs
            b.face([rings[i][k], rings[i + 1][k], rings[i + 1][k2], rings[i][k2]], mname)
    b.face(rings[0], mname)
    b.face(list(reversed(rings[-1])), mname)


# ---------- wheels (axis along x, outer face toward +x) ----------
def wheel(b, R, W, rim_r, style, segs=24, centre=(0, 0, 0), side=1, lod=0):
    cx, cy, cz = centre
    if lod:
        prof = [(rim_r, -W / 2), (R - 0.02, -W / 2), (R, -W / 2 + 0.04), (R, W / 2 - 0.04), (R - 0.02, W / 2), (rim_r, W / 2)]
    else:
        prof = [(rim_r, -W / 2 + 0.01), (R - 0.035, -W / 2), (R - 0.008, -W / 2 + 0.02), (R, -W / 2 + 0.045),
                (R, W / 2 - 0.045), (R - 0.008, W / 2 - 0.02), (R - 0.035, W / 2), (rim_r, W / 2 - 0.01)]

    def P(r, x, a):
        return (cx + side * x, cy + r * math.cos(a), cz + r * math.sin(a))

    angs = [2 * math.pi * k / segs for k in range(segs)]
    grid = [[b.add(P(r, x, a)) for a in angs] for r, x in prof]
    for i in range(len(prof) - 1):
        for k in range(segs):
            k2 = (k + 1) % segs
            f = [grid[i][k], grid[i][k2], grid[i + 1][k2], grid[i + 1][k]]
            b.face(f if side > 0 else list(reversed(f)), 'tyre')
    # wheel face: polar grid, dished, with spoke/hole pattern
    xo = W / 2 - 0.012
    if lod:
        radii = [rim_r, rim_r * 0.55, rim_r * 0.0]
    else:
        radii = [rim_r, rim_r * 0.9, rim_r * 0.74, rim_r * 0.52, rim_r * 0.3, rim_r * 0.16, 0.0]
    nseg = segs if lod else 40
    fa = [2 * math.pi * (k + 0.5) / nseg for k in range(nseg)]

    def dark(ri, k):
        r0, r1 = radii[ri] / rim_r, radii[ri + 1] / rim_r
        rm = (r0 + r1) / 2
        a = fa[k]
        if style == 'alloy':
            if not (0.25 < rm < 0.82):
                return False
            sp = 5
            d = abs(((a * sp / (2 * math.pi)) % 1.0) - 0.5) * 2 * math.pi / sp  # angle to the nearest gap centre
            width = 0.30 - 0.18 * (rm - 0.25)  # spokes widen toward the hub
            return d < (2 * math.pi / sp) * 0.5 - width * (0.9 + 0.3 * (1 - rm))
        if style in ('steel', 'truck'):
            n = 8 if style == 'steel' else 10
            if not (0.5 < rm < 0.75):
                return False
            d = abs(((a * n / (2 * math.pi)) % 1.0) - 0.5)
            return d > 0.3
        return False

    dish = 0.035 if style == 'alloy' else 0.06
    rows = []
    for ri, r in enumerate(radii):
        x = xo - dish * (1 - r / rim_r) ** 0.7
        if r == 0:
            rows.append([b.add(P(0, x + 0.01, 0))] * nseg)
        else:
            rows.append([b.add(P(r, x, 2 * math.pi * k / nseg)) for k in range(nseg)])
    mat_rim = 'rim' if style == 'alloy' else 'steel'
    darkf = [[(dark(ri, k) if not lod else False) for k in range(nseg)] for ri in range(len(radii) - 1)]
    # holes sink into the wheel: vertices surrounded by dark faces only move inward
    if not lod:
        for ri in range(1, len(radii) - 1):
            for k in range(nseg):
                around = [darkf[ri - 1][k], darkf[ri - 1][k - 1], darkf[ri][k], darkf[ri][k - 1]]
                if all(around):
                    vi = rows[ri][k]
                    b.v[vi] = b.v[vi] + Vector((-side * 0.05, 0, 0))
    for ri in range(len(radii) - 1):
        for k in range(nseg):
            k2 = (k + 1) % nseg
            if radii[ri + 1] == 0:
                f = [rows[ri][k], rows[ri][k2], rows[ri + 1][k]]
            else:
                f = [rows[ri][k], rows[ri][k2], rows[ri + 1][k2], rows[ri + 1][k]]
            m = 'rimdark' if darkf[ri][k] else mat_rim
            if style == 'truck' and ri >= len(radii) - 3:
                m = 'chrome'
            b.face(f if side > 0 else list(reversed(f)), m)
    # inner disc so the wheel is not see-through from behind
    back = [b.add(P(rim_r, -W / 2 + 0.02, a)) for a in angs]
    cb = b.add(P(0, -W / 2 + 0.06, 0))
    for k in range(segs):
        k2 = (k + 1) % segs
        f = [cb, back[k2], back[k]]
        b.face(f if side > 0 else list(reversed(f)), 'rimdark')


WHEELS = {
    'alloy': dict(R=0.31, W=0.205, rim_r=0.205, style='alloy'),
    'alloy_suv': dict(R=0.345, W=0.215, rim_r=0.21, style='alloy'),
    'steel': dict(R=0.35, W=0.2, rim_r=0.205, style='steel'),
    'truck': dict(R=0.5, W=0.28, rim_r=0.29, style='truck'),
}


# ---------- vehicle definitions ----------
def car_rows(kind):
    """Cross-sections (z, bot, belt, top, w, gh) for the passenger cars."""
    if kind in ('sedan', 'police'):
        return dict(hw=0.885, tu=0.80, rail=0.065, L=4.42, wheel='alloy', axles=(1.33, -1.30), r=0.31), [
            dict(z=2.21, bot=0.34, belt=0.56, top=0.58, w=0.78),
            dict(z=2.16, bot=0.24, belt=0.66, top=0.685, w=0.90),
            dict(z=2.00, bot=0.20, belt=0.74, top=0.775, w=0.965),
            dict(z=1.65, bot=0.19, belt=0.79, top=0.84, w=0.99),
            dict(z=1.20, bot=0.19, belt=0.83, top=0.885),
            dict(z=0.84, bot=0.19, belt=0.86, top=0.915, crease=0.75, side='G', top_f='W'),
            dict(z=0.0, bot=0.19, belt=0.90, top=1.455, gh=1, side='G', crease=0.5),
            dict(z=-0.40, bot=0.19, belt=0.92, top=1.48, gh=1, side='T'),
            dict(z=-0.50, bot=0.19, belt=0.925, top=1.48, gh=1, side='G'),
            dict(z=-0.88, bot=0.19, belt=0.95, top=1.45, gh=1, top_f='W', crease=0.5),
            dict(z=-1.62, bot=0.19, belt=0.995, top=1.04, crease=0.75),
            dict(z=-1.95, bot=0.19, belt=1.0, top=1.045, w=0.99),
            dict(z=-2.13, bot=0.22, belt=0.97, top=1.0, w=0.95),
            dict(z=-2.21, bot=0.32, belt=0.87, top=0.89, w=0.85),
        ]
    if kind == 'hatch':
        return dict(hw=0.87, tu=0.80, L=4.10, wheel='alloy', axles=(1.22, -1.38), r=0.30), [
            dict(z=2.05, bot=0.36, belt=0.60, top=0.62, w=0.78),
            dict(z=2.01, bot=0.25, belt=0.70, top=0.725, w=0.90),
            dict(z=1.87, bot=0.20, belt=0.77, top=0.80, w=0.965),
            dict(z=1.55, bot=0.19, belt=0.81, top=0.855, w=0.99),
            dict(z=1.10, bot=0.19, belt=0.845, top=0.895),
            dict(z=0.66, bot=0.19, belt=0.88, top=0.93, crease=0.75, side='G', top_f='W'),
            dict(z=-0.02, bot=0.19, belt=0.905, top=1.47, gh=1, side='G', crease=0.5),
            dict(z=-0.44, bot=0.19, belt=0.925, top=1.495, gh=1, side='T'),
            dict(z=-0.54, bot=0.19, belt=0.93, top=1.495, gh=1, side='G'),
            dict(z=-1.10, bot=0.19, belt=0.95, top=1.48, gh=1, side='T'),
            dict(z=-1.20, bot=0.19, belt=0.955, top=1.475, gh=1, side='G'),
            dict(z=-1.52, bot=0.19, belt=0.97, top=1.445, gh=1, top_f='W', crease=0.6, tu=0.78),
            dict(z=-1.86, bot=0.20, belt=0.98, top=1.04, crease=0.7, w=0.985),
            dict(z=-1.98, bot=0.21, belt=0.93, top=0.96, w=0.97),
            dict(z=-2.05, bot=0.33, belt=0.80, top=0.82, w=0.86),
        ]
    if kind == 'suv':
        return dict(hw=0.90, tu=0.81, L=4.33, wheel='alloy_suv', axles=(1.325, -1.285), r=0.345), [
            dict(z=2.165, bot=0.42, belt=0.70, top=0.72, w=0.80),
            dict(z=2.12, bot=0.32, belt=0.82, top=0.85, w=0.91),
            dict(z=1.98, bot=0.27, belt=0.90, top=0.94, w=0.97),
            dict(z=1.65, bot=0.25, belt=0.95, top=1.00, w=0.995),
            dict(z=1.15, bot=0.24, belt=0.99, top=1.05),
            dict(z=0.72, bot=0.24, belt=1.02, top=1.08, crease=0.75, side='G', top_f='W'),
            dict(z=0.05, bot=0.24, belt=1.05, top=1.62, gh=1, side='G', crease=0.5),
            dict(z=-0.40, bot=0.24, belt=1.07, top=1.655, gh=1, side='T'),
            dict(z=-0.50, bot=0.24, belt=1.075, top=1.655, gh=1, side='G'),
            dict(z=-1.12, bot=0.24, belt=1.095, top=1.65, gh=1, side='T'),
            dict(z=-1.22, bot=0.24, belt=1.10, top=1.645, gh=1, side='G'),
            dict(z=-1.62, bot=0.24, belt=1.11, top=1.62, gh=1, top_f='W', crease=0.6, tu=0.79),
            dict(z=-1.95, bot=0.25, belt=1.12, top=1.17, crease=0.7, w=0.99),
            dict(z=-2.08, bot=0.27, belt=1.04, top=1.08, w=0.98),
            dict(z=-2.165, bot=0.40, belt=0.90, top=0.92, w=0.88),
        ]
    raise KeyError(kind)


def passenger(kind, lod):
    car, rows = car_rows(kind)
    hw = car['hw']
    r = car['r']
    zf, zr = car['axles']
    arches = [(zf, r, r + 0.045, hw + 0.3), (zr, r, r + 0.045, hw + 0.3)]
    body = make_body(kind + ('_lo' if lod else ''), car, rows, arches, 1 if lod else 2)
    remap_materials(body.data)
    if not lod:
        inset_glass(body.data)
    surf = Surface(body)
    b = Buf()
    rings = 1 if lod else 2
    zF = rows[0]['z'] + 0.5
    zB = rows[-1]['z'] - 0.5
    front = Vector((0, 0, -1))
    rear = Vector((0, 0, 1))
    yb = rows[1]['bot']
    hood = rows[2]['belt']
    suv = kind == 'suv'
    # headlights: rounded, rising toward the corners; tail lights wrap around the rear corners
    for s in (1, -1):
        cx = s * (hw - 0.27)
        decal(b, surf, slanted(cx, hood - 0.075, 0.46, 0.15, 0.05, s * 0.18, zF), Vector((-s * 0.25, 0, -1)), 'trim', rings, 0.005)
        decal(b, surf, slanted(cx + s * 0.01, hood - 0.077, 0.42, 0.115, 0.04, s * 0.18, zF), Vector((-s * 0.25, 0, -1)), 'head', rings, 0.009)
        if kind in ('sedan', 'police'):
            tl = slanted(s * (hw - 0.2), hood + 0.06, 0.36, 0.13, 0.04, -s * 0.1, zB)
        else:
            tl = slanted(s * (hw - 0.13), hood + 0.13, 0.2, 0.3, 0.04, 0, zB)
        decal(b, surf, tl, Vector((-s * 0.4, 0, 1)), 'tail', rings, 0.007)
        # fog/indicator in the bumper corners
        decal(b, surf, rrect(s * (hw - 0.22), yb + 0.18, 0.16, 0.06, 0.03, 2, 'xy', zF), front, 'amber', 1, 0.006)
    # grille between the lamps and the lower intake
    gy = hood - 0.10
    decal(b, surf, rrect(0, gy, 0.62, 0.11, 0.04, 3, 'xy', zF), front, 'grille', rings, 0.007)
    decal(b, surf, rrect(0, gy + 0.045, 0.6, 0.016, 0.006, 1, 'xy', zF), front, 'chrome', 1, 0.011)
    front_grid(b, surf, 1, -0.62, 0.62, yb + 0.05, yb + 0.19, 'grille', 10, 2, 0.006)
    # number plates (520 x 112 mm)
    decal(b, surf, rrect(0, yb + 0.30, 0.54, 0.13, 0.015, 1, 'xy', zF), front, 'plate', 1, 0.011)
    decal(b, surf, rrect(0, hood - 0.03 if kind in ('sedan', 'police') else hood - 0.02, 0.54, 0.13, 0.015, 1, 'xy', zB), rear, 'plate', 1, 0.011)
    # rear bumper lower part
    front_grid(b, surf, -1, -(hw - 0.25), hw - 0.25, yb + 0.1, yb + 0.2, 'plastic', 12, 1, 0.005)
    if suv:
        # black cladding along the sills and bumpers
        for s in (1, -1):
            strip(b, surf, s, rows[1]['z'], rows[-2]['z'], rows[5]['bot'] + 0.02, rows[5]['bot'] + 0.22, 'plastic', 40 if not lod else 16, 2, 0.006)
        decal(b, surf, rrect(0, yb + 0.12, 2 * hw - 0.2, 0.2, 0.05, 3, 'xy', zF), front, 'plastic', rings, 0.004)
        for s in (1, -1):
            for z in (zf, zr):
                arch_flare(b, surf, z, r, r + 0.035, r + 0.11, s, 'plastic', 10 if lod else 14)
    if not lod:
        # door seams, handles
        doors = [rows[5]['z'] - 0.02, (rows[7]['z'] + rows[8]['z']) / 2, rows[9]['z'] - 0.02 if kind != 'sedan' and kind != 'police' else rows[9]['z'] + 0.05]
        for s in (1, -1):
            for z in doors:
                seam = [(s * (hw + 0.5), rows[5]['belt'] + 0.01, z + 0.004), (s * (hw + 0.5), rows[5]['belt'] + 0.01, z - 0.004),
                        (s * (hw + 0.5), rows[5]['bot'] + 0.12, z - 0.004), (s * (hw + 0.5), rows[5]['bot'] + 0.12, z + 0.004)]
                decal(b, surf, seam, Vector((-s, 0, 0)), 'seam', 1, 0.002)
            for z in doors[:2]:
                decal(b, surf, rrect(z - 0.2, rows[5]['belt'] - 0.08, 0.13, 0.03, 0.012, 1, 'zy', s * (hw + 0.5)), Vector((-s, 0, 0)), 'chrome' if kind == 'suv' else 'paint', 1, 0.008)
            # side mirrors on the door, just behind the A-pillar base
            mz = rows[5]['z'] - 0.2
            my = rows[5]['belt'] + 0.1
            blob(b, (s * (hw + 0.09), my, mz), (0.085, 0.055, 0.05), 'paint', back='trim')
            box(b, (s * (hw + 0.01), my - 0.04, mz + 0.03), (0.08, 0.03, 0.06), 'trim')
    if kind == 'police':
        for s in (1, -1):
            strip(b, surf, s, rows[2]['z'] - 0.05, rows[-3]['z'], 0.56, 0.70, 'blue', 40 if not lod else 16, 1, 0.006)
        # roof light bar
        top = rows[7]['top']
        box(b, (0, top + 0.03, -0.28), (1.15, 0.06, 0.26), 'plastic')
        box(b, (0.29, top + 0.10, -0.28), (0.52, 0.09, 0.22), 'beacon_blue')
        box(b, (-0.29, top + 0.10, -0.28), (0.52, 0.09, 0.22), 'beacon_red')
    if suv:
        # roof rails
        for s in (1, -1):
            line = []
            for z in (0.0, -0.3, -0.7, -1.1, -1.45):
                p = surf.hit((s * hw * 0.62, 3.0, z), Vector((0, -1, 0)), 0.0)
                if p is not None:
                    line.append(p + Vector((0, 0.05, 0)))
            if len(line) > 1:
                tube(b, line, 0.022, 'plastic', 6)
    if lod:
        w = WHEELS[car['wheel']]
        for z in (zf, zr):
            for s in (1, -1):
                wheel(b, w['R'], w['W'], w['rim_r'], w['style'], 10, (s * (hw - 0.1 - w['W'] / 2 + 0.07), r, z), s, 1)
    extra = new_obj(kind + '_parts', b.mesh(kind + '_parts'))
    join(body, extra)
    w = WHEELS[car['wheel']]
    body['vehicle'] = json.dumps({
        'len': round(rows[0]['z'] - rows[-1]['z'], 3), 'wid': round(2 * hw + 0.2, 3), 'h': round(max(rw['top'] for rw in rows), 3),
        'wheel': car['wheel'], 'r': w['R'],
        'wheels': [[round(s * (hw - 0.1 - w['W'] / 2 + 0.07), 3), r, z, 1 if z == zf else 0] for z in (zf, zr) for s in (1, -1)],
        'beacon': round(rows[7]['top'] + 0.1, 3) if kind == 'police' else 0,
    })
    return body


def join(target, other):
    bm = bmesh.new()
    bm.from_mesh(target.data)
    bm.from_mesh(other.data)
    bm.to_mesh(target.data)
    bm.free()
    bpy.data.objects.remove(other)


# ---------- van (GAZelle-like), bus, lorry ----------
def van(lod):
    hw = 1.035
    car = dict(hw=hw, tu=0.92, rail=0.12, cap=0.7, lcrease={1: 0.9, 3: 0.3, 5: 0.6, 7: 0.85, 8: 0.6})
    rows = [
        dict(z=2.815, bot=0.45, belt=0.80, top=0.82, w=0.84),
        dict(z=2.77, bot=0.36, belt=0.93, top=0.96, w=0.93),
        dict(z=2.62, bot=0.33, belt=1.03, top=1.08, w=0.975),
        dict(z=2.30, bot=0.33, belt=1.12, top=1.18, w=0.995),
        dict(z=1.92, bot=0.33, belt=1.18, top=1.24, crease=0.8, side='G', top_f='W'),
        dict(z=1.02, bot=0.33, belt=1.25, top=2.30, gh=1, side='G', crease=0.8),
        dict(z=0.35, bot=0.33, belt=1.25, top=2.33, gh=1, tu=0.93),
        dict(z=-1.0, bot=0.40, belt=1.25, top=2.34, gh=1, tu=0.93),
        dict(z=-2.70, bot=0.40, belt=1.25, top=2.34, gh=1, tu=0.93, crease=0.6),
        dict(z=-2.79, bot=0.42, belt=1.24, top=2.32, gh=1, w=0.985, tu=0.93),
        dict(z=-2.815, bot=0.47, belt=1.2, top=2.28, gh=1, w=0.965, tu=0.93),
    ]
    zf, zr, r = 1.835, -1.31, 0.35
    body = make_body('van' + ('_lo' if lod else ''), car, rows, [(zf, r, r + 0.07, hw + 0.3), (zr, r, r + 0.07, hw + 0.3)], 1 if lod else 2)
    remap_materials(body.data)
    if not lod:
        inset_glass(body.data)
    surf = Surface(body)
    b = Buf()
    rings = 1 if lod else 2
    zF, zB = 3.4, -3.4
    front, rear = Vector((0, 0, -1)), Vector((0, 0, 1))
    for s in (1, -1):
        decal(b, surf, slanted(s * (hw - 0.25), 0.93, 0.44, 0.17, 0.05, s * 0.12, zF), Vector((-s * 0.3, 0, -1)), 'trim', rings, 0.005)
        decal(b, surf, slanted(s * (hw - 0.24), 0.928, 0.40, 0.135, 0.04, s * 0.12, zF), Vector((-s * 0.3, 0, -1)), 'head', rings, 0.009)
        decal(b, surf, rrect(s * (hw - 0.09), 0.95, 0.12, 0.55, 0.03, 2, 'xy', zB), Vector((-s * 0.3, 0, 1)), 'tail', rings, 0.007)
        decal(b, surf, rrect(s * (hw - 0.24), 0.52, 0.18, 0.07, 0.03, 2, 'xy', zF), front, 'amber', 1, 0.006)
    decal(b, surf, rrect(0, 0.90, 1.0, 0.2, 0.05, 3, 'xy', zF), front, 'grille', rings, 0.007)
    decal(b, surf, rrect(0, 0.985, 0.98, 0.02, 0.008, 1, 'xy', zF), front, 'chrome', 1, 0.011)
    decal(b, surf, rrect(0, 0.52, 2 * hw - 0.15, 0.22, 0.06, 3, 'xy', zF), front, 'plastic', rings, 0.005)
    decal(b, surf, rrect(0, 0.52, 0.54, 0.13, 0.015, 1, 'xy', zF), front, 'plate', 1, 0.012)
    decal(b, surf, rrect(0, 0.56, 2 * hw - 0.1, 0.2, 0.05, 3, 'xy', zB), rear, 'plastic', rings, 0.005)
    decal(b, surf, rrect(0, 0.75, 0.54, 0.13, 0.015, 1, 'xy', zB), rear, 'plate', 1, 0.011)
    if not lod:
        # rear doors split, sliding side door outline (right side = -x), cab door seams
        decal(b, surf, rrect(0, 1.55, 0.012, 1.45, 0.003, 1, 'xy', zB), rear, 'seam', 1, 0.003)
        for s in (1, -1):
            decal(b, surf, rrect(s * 0.1, 1.45, 0.06, 0.16, 0.01, 1, 'xy', zB), rear, 'trim', 1, 0.006)
            for z in (1.62, 0.30):
                seam = [(s * 2, 2.2, z + 0.004), (s * 2, 2.2, z - 0.004), (s * 2, 0.5, z - 0.004), (s * 2, 0.5, z + 0.004)]
                decal(b, surf, seam, Vector((-s, 0, 0)), 'seam', 1, 0.002)
            blob(b, (s * (hw + 0.16), 1.62, 1.62), (0.06, 0.16, 0.05), 'plastic', back='trim')
            tube(b, [(s * (hw - 0.02), 1.45, 1.70), (s * (hw + 0.12), 1.55, 1.64)], 0.015, 'plastic', 4)
        for z in (-0.20, -1.35):
            seam = [(-2, 2.2, z + 0.004), (-2, 2.2, z - 0.004), (-2, 0.5, z - 0.004), (-2, 0.5, z + 0.004)]
            decal(b, surf, seam, Vector((1, 0, 0)), 'seam', 1, 0.002)
    if lod:
        w = WHEELS['steel']
        for z in (zf, zr):
            for s in (1, -1):
                wheel(b, w['R'], w['W'], w['rim_r'], w['style'], 10, (s * (hw - 0.17), r, z), s, 1)
    extra = new_obj('van_parts', b.mesh('van_parts'))
    join(body, extra)
    body['vehicle'] = json.dumps({'len': 5.63, 'wid': 2.07, 'h': 2.34, 'wheel': 'steel', 'r': 0.35,
                                  'wheels': [[round(s * (hw - 0.17), 3), r, z, 1 if z == zf else 0] for z in (zf, zr) for s in (1, -1)], 'beacon': 0})
    return body


def bus(lod):
    hw = 1.275
    car = dict(hw=hw, tu=0.975, rail=0.40, lcrease={1: 0.9, 5: 0.5, 7: 0.6, 8: 0.6})
    L = 12.0
    rows = [dict(z=6.0, bot=0.42, belt=1.0, top=2.80, w=0.95, gh=1, tu=0.96, rail=0.42),
            dict(z=5.95, bot=0.33, belt=1.02, top=2.86, w=0.985, gh=1, rail=0.42),
            dict(z=5.80, bot=0.33, belt=1.04, top=2.88, gh=1, side='T')]
    # windows with narrow pillars
    z = 5.3
    while z > -5.2:
        rows.append(dict(z=z, bot=0.33, belt=1.05, top=2.88, gh=1, side='G'))
        rows.append(dict(z=z - 1.32, bot=0.33, belt=1.05, top=2.88, gh=1, side='T'))
        z -= 1.42
    rows[-1]['side'] = 'P'
    rows.append(dict(z=-5.80, bot=0.33, belt=1.05, top=2.88, gh=1))
    rows.append(dict(z=-5.95, bot=0.36, belt=1.04, top=2.86, w=0.985, gh=1, rail=0.42))
    rows.append(dict(z=-6.0, bot=0.45, belt=1.0, top=2.80, w=0.95, gh=1, tu=0.96, rail=0.42))
    for row in rows:
        row['top_f'] = 'R'
    zf, zr, r = 3.35, -2.49, 0.5
    body = make_body('bus' + ('_lo' if lod else ''), car, rows, [(zf, r, r + 0.08, hw + 0.3), (zr, r, r + 0.08, hw + 0.3)], 1)
    remap_materials(body.data)
    if not lod:
        inset_glass(body.data, 0.03, 0.01)
    surf = Surface(body)
    b = Buf()
    rings = 1 if lod else 2
    zF, zB = 7, -7
    front, rear = Vector((0, 0, -1)), Vector((0, 0, 1))
    decal(b, surf, rrect(0, 1.82, 2 * hw - 0.16, 1.5, 0.12, 3, 'xy', zF), front, 'trim', rings, 0.005)
    decal(b, surf, rrect(0, 1.78, 2 * hw - 0.26, 1.36, 0.1, 3, 'xy', zF), front, 'glass', rings, 0.009)
    decal(b, surf, rrect(0, 2.66, 1.6, 0.2, 0.03, 2, 'xy', zF), front, 'trim', rings, 0.012)
    decal(b, surf, rrect(0, 1.9, 2 * hw - 0.3, 1.0, 0.1, 3, 'xy', zB), rear, 'glass', rings, 0.007)
    for s in (1, -1):
        decal(b, surf, rrect(s * (hw - 0.22), 0.72, 0.3, 0.14, 0.04, 2, 'xy', zF), front, 'trim', rings, 0.006)
        decal(b, surf, rrect(s * (hw - 0.22), 0.72, 0.27, 0.11, 0.03, 2, 'xy', zF), front, 'head', rings, 0.01)
        decal(b, surf, rrect(s * (hw - 0.12), 0.95, 0.16, 0.45, 0.03, 2, 'xy', zB), rear, 'tail', rings, 0.007)
    decal(b, surf, rrect(0, 0.48, 2 * hw - 0.1, 0.25, 0.05, 3, 'xy', zF), front, 'plastic', rings, 0.005)
    decal(b, surf, rrect(0, 0.62, 0.54, 0.13, 0.015, 1, 'xy', zF), front, 'plate', 1, 0.012)
    decal(b, surf, rrect(0, 0.62, 0.54, 0.13, 0.015, 1, 'xy', zB), rear, 'plate', 1, 0.012)
    # doors on the right (-x): front, middle, rear
    for zc in (4.9, 0.25, -4.2):
        decal(b, surf, rrect(zc, 1.5, 1.25, 2.3, 0.05, 2, 'zy', -3), Vector((1, 0, 0)), 'trim', rings, 0.008)
        for dz in (-0.3, 0.3):
            decal(b, surf, rrect(zc + dz, 1.5, 0.5, 2.15, 0.04, 2, 'zy', -3), Vector((1, 0, 0)), 'glass', rings, 0.013)
    # roof unit
    box(b, (0, 2.98, -3.5), (1.7, 0.2, 2.2), 'white')
    if lod:
        w = WHEELS['truck']
        for z, ww in ((zf, 0.3), (zr, 0.5)):
            for s in (1, -1):
                wheel(b, w['R'], ww, w['rim_r'], w['style'], 10, (s * (hw - 0.05 - ww / 2), r, z), s, 1)
    extra = new_obj('bus_parts', b.mesh('bus_parts'))
    join(body, extra)
    w = WHEELS['truck']
    body['vehicle'] = json.dumps({'len': L, 'wid': 2.55, 'h': 3.08, 'wheel': 'truck', 'r': 0.5,
                                  'wheels': [[round(s * (hw - 0.05 - ww / 2), 3), r, z, 1 if z == zf else 0, ww] for z, ww in ((zf, 0.3), (zr, 0.5)) for s in (1, -1)], 'beacon': 0})
    return body


def lorry(lod):
    hw = 1.24
    car = dict(hw=hw, tu=0.90, rail=0.22, lcrease={1: 0.9, 5: 0.4, 7: 0.6})
    rows = [
        dict(z=4.0, bot=0.66, belt=1.55, top=2.86, w=0.93, gh=1, tu=0.86, rail=0.25),
        dict(z=3.95, bot=0.56, belt=1.60, top=2.93, w=0.98, gh=1, tu=0.88, rail=0.25, side='G'),
        dict(z=3.10, bot=0.56, belt=1.62, top=2.96, gh=1, side='T'),
        dict(z=2.95, bot=0.80, belt=1.62, top=2.96, gh=1),
        dict(z=2.42, bot=1.0, belt=1.62, top=2.95, gh=1, w=0.99),
        dict(z=2.36, bot=1.05, belt=1.60, top=2.90, gh=1, w=0.96),
    ]
    zf, zr, r = 2.85, -1.45, 0.48
    body = make_body('lorry' + ('_lo' if lod else ''), car, rows, [(zf, r, r + 0.08, hw + 0.3)], 1 if lod else 2)
    remap_materials(body.data)
    if not lod:
        inset_glass(body.data, 0.025, 0.008)
    surf = Surface(body)
    b = Buf()
    rings = 1 if lod else 2
    front = Vector((0, 0, -1))
    decal(b, surf, rrect(0, 2.2, 2 * hw - 0.2, 1.05, 0.12, 3, 'xy', 5), front, 'trim', rings, 0.005)
    decal(b, surf, rrect(0, 2.2, 2 * hw - 0.3, 0.95, 0.1, 3, 'xy', 5), front, 'glass', rings, 0.009)
    decal(b, surf, rrect(0, 1.38, 1.5, 0.42, 0.06, 3, 'xy', 5), front, 'grille', rings, 0.007)
    for s in (1, -1):
        decal(b, surf, rrect(s * (hw - 0.25), 0.88, 0.34, 0.16, 0.04, 2, 'xy', 5), front, 'trim', rings, 0.006)
        decal(b, surf, rrect(s * (hw - 0.25), 0.88, 0.3, 0.12, 0.03, 2, 'xy', 5), front, 'head', rings, 0.01)
        decal(b, surf, rrect(s * (hw - 0.05), 0.92, 0.1, 0.1, 0.02, 1, 'xy', 5), Vector((-s * 0.6, 0, -1)), 'amber', 1, 0.008)
        # mirrors on arms
        blob(b, (s * (hw + 0.24), 2.25, 3.92), (0.06, 0.2, 0.05), 'plastic', back='trim')
        tube(b, [(s * (hw - 0.02), 2.0, 3.85), (s * (hw + 0.2), 2.05, 3.9)], 0.016, 'plastic', 4)
        # step
        box(b, (s * (hw - 0.12), 0.48, 2.95), (0.3, 0.05, 0.3), 'plastic')
    decal(b, surf, rrect(0, 0.70, 2 * hw - 0.05, 0.26, 0.05, 3, 'xy', 5), front, 'plastic', rings, 0.005)
    decal(b, surf, rrect(0, 0.70, 0.54, 0.13, 0.015, 1, 'xy', 5), front, 'plate', 1, 0.012)
    # chassis: frame rails, fuel tank, battery box, mudguards, rear bumper with lamps
    for s in (1, -1):
        box(b, (s * 0.43, 0.88, -0.2), (0.1, 0.26, 8.0), 'under')
        box(b, (s * (hw - 0.22), r * 2 + 0.06, zr), (0.62, 0.04, 1.5), 'plastic')
        box(b, (s * (hw - 0.45), 0.9, 0.9), (0.6, 0.12, 1.2) if lod else (0.62, 0.12, 1.25), 'plastic')
    tank = Buf()
    tube(b, [(hw - 0.3, 0.78, 1.95), (hw - 0.3, 0.78, 0.95)], 0.27, 'steel', 10)
    box(b, (-(hw - 0.35), 0.78, 1.6), (0.5, 0.45, 0.7), 'plastic')
    box(b, (0, 0.62, -3.75), (2 * hw - 0.2, 0.12, 0.1), 'plastic')
    for s in (1, -1):
        box(b, (s * (hw - 0.3), 0.8, -3.83), (0.32, 0.12, 0.04), 'tail')
        box(b, (s * (hw - 0.62), 0.8, -3.83), (0.16, 0.12, 0.04), 'amber')
    # van body
    box(b, (0, 1.12, -0.95), (2 * hw - 0.3, 0.12, 6.1), 'under')
    bx = Buf()
    box(bx, (0, 2.32, -0.95), (2 * hw + 0.02, 2.28, 6.1), 'box')
    vb = new_obj('lorry_box', bx.mesh('lorry_box'))
    fix_normals(vb.data)
    bev = vb.modifiers.new('bev', 'BEVEL')
    bev.width = 0.05
    bev.segments = 2 if not lod else 1
    bake(vb)
    remap_materials(vb.data)
    sb = Surface(vb)
    if not lod:
        decal(b, sb, rrect(0, 2.3, 0.012, 2.1, 0.003, 1, 'xy', -5), Vector((0, 0, 1)), 'seam', 1, 0.003)
        for s in (1, -1):
            for y in (1.7, 2.9):
                decal(b, sb, rrect(s * 0.18, y, 0.05, 0.6, 0.01, 1, 'xy', -5), Vector((0, 0, 1)), 'steel', 1, 0.01)
    join(body, vb)
    if lod:
        w = WHEELS['truck']
        for z, ww in ((zf, 0.3), (zr, 0.5)):
            for s in (1, -1):
                wheel(b, w['R'], ww, w['rim_r'], w['style'], 10, (s * (hw - 0.08 - ww / 2), r, z), s, 1)
    extra = new_obj('lorry_parts', b.mesh('lorry_parts'))
    join(body, extra)
    body['vehicle'] = json.dumps({'len': 8.0, 'wid': 2.5, 'h': 3.46, 'wheel': 'truck', 'r': r,
                                  'wheels': [[round(s * (hw - 0.08 - ww / 2), 3), r, z, 1 if z == zf else 0, ww] for z, ww in ((zf, 0.3), (zr, 0.5)) for s in (1, -1)], 'beacon': 0})
    return body


TRACTOR = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'game', 'assets', 'models', 'tractor.glb')
TRACTOR_ROLES = {
    'MAT-paint': 'paint', 'MAT-tyre_moulded': 'tyre', 'MAT-rubber': 'tyre', 'MAT-trim': 'trim', 'MAT-wheel_alloy': 'rim',
    'MAT-steel': 'steel', 'MAT-reflector_amber': 'amber', 'MAT-reflector_red': 'tail', 'MAT-lamp_front': 'head',
    'MAT-glass': 'glass', 'MAT-mirror': 'chrome', 'MAT-chrome': 'chrome', 'MAT-headlamp_lens': 'head',
}


def semi_tractor(lod):
    """The player's tractor without the cab interior, decimated for traffic. Origin at the tandem centre."""
    before = set(SC.objects)
    bpy.ops.import_scene.gltf(filepath=TRACTOR)
    new = [o for o in SC.objects if o not in before]
    names = [o.name for o in new]
    parts = []
    for o in new:
        if o.type != 'MESH' or any(k in o.name for k in ('dashboard', 'steering', 'interior')):
            continue
        o.data = o.data.copy()
        o.data.transform(o.matrix_world)
        me = o.data
        roles = [TRACTOR_ROLES.get(m.name.split('.')[0], 'trim') if m else 'trim' for m in me.materials]
        idx = []
        for poly in me.polygons:
            role = roles[poly.material_index] if poly.material_index < len(roles) else 'trim'
            c = G(poly.center)
            if role == 'head' and c.z < -1.0:
                role = 'white'  # reversing lamps stay unlit
            idx.append(mi(role))
        me.materials.clear()
        for n in MLIST:
            me.materials.append(MATS[n])
        for poly, k in zip(me.polygons, idx):
            poly.material_index = k
            poly.use_smooth = True
        o2 = new_obj(o.name + '_x', me)
        wheel = 'wheel' in o.name
        ratio = (0.05 if wheel else 0.2) if not lod else (0.02 if wheel else 0.05)
        if tris(o2) > 200:
            m = o2.modifiers.new('dec', 'DECIMATE')
            m.ratio = ratio
            bake(o2)
            remap_materials(o2.data)
        parts.append(o2)
    for n in names:
        if n in bpy.data.objects:
            bpy.data.objects.remove(bpy.data.objects[n])
    body = parts[0]
    body.name = 'semi' + ('_lo' if lod else '')
    for o in parts[1:]:
        join(body, o)
    body.data.transform(__import__('mathutils').Matrix.Translation(V((0, 0, 1.95))))
    body['vehicle'] = json.dumps({'len': 7.65, 'wid': 2.55, 'h': 3.9, 'wheel': '', 'r': 0.55, 'wheels': [], 'beacon': 0, 'kingpin': 0.35, 'front': 5.7})
    return body


def trailer(kind, lod):
    """13.6 m semi-trailer, origin at the king pin on the ground, body toward -z."""
    b = Buf()
    W, front, L = 2.55, 1.3, 13.6
    rear = front - L
    deck, h = 1.28, 2.75
    top = deck + h
    axle = front - 8.6
    hw = W / 2
    # body shell: sides subdivided along z so the curtain can fold
    n = 1 if kind == 'reefer' or lod else 70
    zs = [front - (L * i / n) for i in range(n + 1)]
    side_mat = 'paint' if kind == 'curtain' else 'box'
    for sgn in (1, -1):
        cols = []
        for i, z in enumerate(zs):
            fold = 0 if n == 1 or i in (0, n) else 0.025 * math.sin(i * math.pi * 0.9) * (1 - abs(math.sin(i * 0.37)) * 0.4)
            x = sgn * (hw - 0.02 + fold)
            cols.append([b.add((x, deck + 0.14, z)), b.add((x, top - 0.12, z))])
        for i in range(n):
            f = [cols[i][0], cols[i + 1][0], cols[i + 1][1], cols[i][1]]
            b.face(f if sgn < 0 else list(reversed(f)), side_mat)
    # roof, front wall, floor rails, top rails
    box(b, (0, top - 0.04, (front + rear) / 2), (W - 0.02, 0.08, L), 'white')
    box(b, (0, (deck + top) / 2, front - 0.03), (W, h, 0.06), 'white' if kind == 'curtain' else 'box')
    box(b, (0, top - 0.08, (front + rear) / 2), (W + 0.02, 0.14, L + 0.01), 'alu')
    box(b, (0, deck + 0.08, (front + rear) / 2), (W + 0.02, 0.18, L + 0.01), 'alu')
    if kind == 'curtain' and not lod:
        # vertical straps and the buckle line
        z = front - 0.6
        while z > rear + 0.4:
            for sgn in (1, -1):
                box(b, (sgn * (hw + 0.012), (deck + top) / 2, z), (0.012, h - 0.25, 0.05), 'trim')
                box(b, (sgn * (hw + 0.02), deck + 0.32, z), (0.02, 0.08, 0.07), 'steel')
            z -= 0.78
    if kind == 'reefer':
        box(b, (0, top - 0.95, front + 0.3), (2.0, 1.5, 0.5), 'white')
        box(b, (0, top - 0.95, front + 0.56), (1.5, 0.9, 0.03), 'grille')
        box(b, (0, top - 0.25, front + 0.3), (2.04, 0.1, 0.54), 'plastic')
    # rear doors
    box(b, (0, (deck + top) / 2, rear + 0.02), (W, h - 0.1, 0.06), 'white' if kind == 'curtain' else 'box')
    if not lod:
        for x in (-0.95, -0.35, 0.35, 0.95):
            box(b, (x, (deck + top) / 2, rear - 0.02), (0.035, h - 0.3, 0.035), 'chrome')
        box(b, (0, (deck + top) / 2, rear - 0.015), (0.01, h - 0.2, 0.01), 'seam')
    # chassis
    for sgn in (1, -1):
        box(b, (sgn * 0.5, deck - 0.2, (front + rear) / 2 + 0.3), (0.12, 0.34, L - 0.8), 'under')
    box(b, (0, deck - 0.05, (front + rear) / 2), (W - 0.1, 0.1, L - 0.2), 'under')
    # landing gear
    for sgn in (1, -1):
        box(b, (sgn * 0.88, (deck - 0.1) / 2 + 0.1, -0.5), (0.13, deck - 0.2, 0.13), 'steel')
        box(b, (sgn * 0.88, 0.06, -0.5), (0.3, 0.06, 0.3), 'steel')
    box(b, (0, 0.75, -0.5), (1.6, 0.06, 0.06), 'steel')
    # side guards between landing gear and axles
    z0, z1 = -1.1, axle + 1.31 + 0.66
    for sgn in (1, -1):
        for y in (0.62, 0.92):
            box(b, (sgn * (hw - 0.04), y, (z0 + z1) / 2), (0.03, 0.1, z0 - z1), 'alu')
    # mudguards and flaps
    for sgn in (1, -1):
        box(b, (sgn * (hw - 0.22), 1.12, axle), (0.52, 0.04, 4.3), 'plastic')
        box(b, (sgn * (hw - 0.22), 0.6, axle - 2.2), (0.5, 0.95, 0.02), 'plastic')
    # rear underrun bar, lamps, plate
    box(b, (0, 0.55, rear + 0.25), (W - 0.15, 0.14, 0.12), 'steel')
    for sgn in (1, -1):
        box(b, (sgn * 0.62, 0.55, rear + 0.6), (0.08, 0.5, 0.08), 'steel')
        box(b, (sgn * (hw - 0.3), 0.82, rear + 0.08), (0.42, 0.16, 0.05), 'tail')
        box(b, (sgn * (hw - 0.62), 0.82, rear + 0.08), (0.16, 0.16, 0.05), 'amber')
        box(b, (sgn * (hw - 0.1), top - 0.05, rear + 0.05), (0.08, 0.08, 0.06), 'tail')
        z = front - 1.0
        while z > rear + 0.8:
            box(b, (sgn * (hw + 0.005), deck + 0.05, z), (0.03, 0.05, 0.09), 'marker')
            z -= 2.6
    box(b, (0, 0.82, rear + 0.08), (0.54, 0.13, 0.03), 'plate')
    # axles with wheels (baked, they are far away most of the time)
    w = dict(R=0.54, W=0.38, rim_r=0.3, style='truck')
    for dz in (-1.31, 0.0, 1.31):
        box(b, (0, 0.54, axle + dz), (W - 0.6, 0.12, 0.12), 'under')
        for sgn in (1, -1):
            wheel(b, w['R'], w['W'], w['rim_r'], w['style'], 12 if lod else 18, (sgn * (hw - 0.04 - w['W'] / 2), w['R'], axle + dz), sgn, 1 if lod else 0)
    name = 'trailer_' + kind + ('_lo' if lod else '')
    o = new_obj(name, b.mesh(name))
    o['vehicle'] = json.dumps({'len': L, 'wid': W, 'h': top, 'front': front, 'axle': axle, 'wheel': '', 'r': 0.54, 'wheels': [], 'beacon': 0})
    return o


def wheel_obj(name):
    w = WHEELS[name]
    b = Buf()
    wheel(b, w['R'], w['W'], w['rim_r'], w['style'], 22 if w['R'] < 0.4 else 26, (0, 0, 0), 1, 0)
    o = new_obj('wheel_' + name, b.mesh('wheel_' + name))
    o['vehicle'] = json.dumps({'r': w['R'], 'w': w['W']})
    return o


def tris(o):
    return sum(len(p.vertices) - 2 for p in o.data.polygons)


def decimate(o, target):
    n = tris(o)
    if n <= target:
        return
    m = o.modifiers.new('dec', 'DECIMATE')
    m.ratio = target / n
    m.use_collapse_triangulate = True
    bake(o)
    remap_materials(o.data)


t0 = time.time()
built = []
for kind in ('sedan', 'hatch', 'suv', 'police', 'van', 'bus', 'lorry', 'semi', 'trailer_curtain', 'trailer_reefer'):
    if ONLY and kind not in ONLY.split(','):
        continue
    for lod in (0, 1):
        if kind.startswith('trailer_'):
            o = trailer(kind[8:], lod)
        elif kind == 'semi':
            o = semi_tractor(lod)
        else:
            o = passenger(kind, lod) if kind in ('sedan', 'hatch', 'suv', 'police') else globals()[kind](lod)
        if lod:
            decimate(o, {'bus': 1600, 'lorry': 1500, 'semi': 2600, 'trailer_curtain': 1400, 'trailer_reefer': 1400}.get(kind, 1200))
        built.append(o)
        print(o.name, tris(o), 'tris')
for name in WHEELS:
    o = wheel_obj(name)
    built.append(o)
    print(o.name, tris(o), 'tris')
print('built in', round(time.time() - t0, 1), 's')

for o in list(SC.objects):
    if o not in built:
        bpy.data.objects.remove(o)

def preview_scene():
    ground = bpy.data.objects.new('ground', bpy.data.meshes.new('ground'))
    gm = ground.data
    gm.from_pydata([(-80, -80, 0), (80, -80, 0), (80, 80, 0), (-80, 80, 0)], [], [(0, 1, 2, 3)])
    gmat = bpy.data.materials.new('ground')
    gmat.use_nodes = True
    gmat.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (0.12, 0.12, 0.12, 1)
    gmat.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value = 0.8
    gm.materials.append(gmat)
    SC.collection.objects.link(ground)
    sun = bpy.data.objects.new('sun', bpy.data.lights.new('sun', 'SUN'))
    sun.data.energy = 4
    sun.data.angle = math.radians(2)
    sun.rotation_euler = (math.radians(50), 0, math.radians(30))
    SC.collection.objects.link(sun)
    world = bpy.data.worlds.new('w')
    SC.world = world
    world.use_nodes = True
    sky = world.node_tree.nodes.new('ShaderNodeTexSky')
    world.node_tree.links.new(sky.outputs[0], world.node_tree.nodes['Background'].inputs[0])
    world.node_tree.nodes['Background'].inputs[1].default_value = 0.35
    SC.render.engine = 'CYCLES'
    SC.cycles.samples = 24
    SC.cycles.device = 'CPU'
    SC.render.resolution_x = 2000
    SC.render.resolution_y = 380
    SC.view_settings.view_transform = 'AgX'
    return [ground, sun]


def preview(o):
    """Three views (front 3/4, side, rear 3/4) of one model in a row."""
    spec = json.loads(o['vehicle'])
    temp = []
    L = spec['len'] + (12 if o.name.startswith('semi') else 0)
    gap = L * 1.08
    for i, rot in enumerate((0, -35, -90, 145)):
        c = o.copy()
        SC.collection.objects.link(c)
        c.hide_render = False
        c.location = ((i - 1.5) * gap + (spec['wid'] * 0.6 - gap * 0.25 if i == 0 else 0), 0, 0)
        c.rotation_euler = (0, 0, math.radians(rot))
        temp.append(c)
        if o.name.startswith('semi') and 'trailer_curtain' in bpy.data.objects:
            t = bpy.data.objects['trailer_curtain' + ('_lo' if o.name.endswith('_lo') else '')].copy()
            SC.collection.objects.link(t)
            t.hide_render = False
            t.parent = c
            t.location = V((0, 0, 0.35))
            temp.append(t)
        if not o.name.endswith('_lo'):
            for wx, wy, wz, steer, *ww in spec['wheels']:
                src = bpy.data.objects['wheel_' + spec['wheel']]
                w = src.copy()
                SC.collection.objects.link(w)
                w.hide_render = False
                w.parent = c
                w.location = V((wx, wy, wz))
                if wx < 0:
                    w.rotation_euler = (0, 0, math.pi)
                if ww:
                    w.scale = (ww[0] / json.loads(src['vehicle'])['w'], 1, 1)
                temp.append(w)
    cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam'))
    SC.collection.objects.link(cam)
    centre = Vector((0, 0, spec['h'] * 0.42))
    cam.location = centre + Vector((0, -gap * 4.6, gap * 0.4))
    cam.rotation_euler = (centre - cam.location).to_track_quat('-Z', 'Y').to_euler()
    cam.data.lens = 50
    SC.camera = cam
    temp.append(cam)
    SC.render.filepath = PREVIEW.replace('.png', '-' + o.name + '.png')
    t = time.time()
    bpy.ops.render.render(write_still=True)
    print('render', o.name, round(time.time() - t, 1), 's')
    for x in temp:
        bpy.data.objects.remove(x)


if PREVIEW:
    withlo = 'lo' in sys.argv
    for o in built:
        o.hide_render = True
    extra = preview_scene()
    for o in built:
        if o.name.startswith('wheel') or (o.name.endswith('_lo') and not withlo):
            continue
        preview(o)
    for x in extra:
        bpy.data.objects.remove(x)
    for o in built:
        o.hide_render = False

bpy.ops.export_scene.gltf(filepath=OUT, export_format='GLB', export_extras=True, export_apply=False, export_yup=True,
                          export_texcoords=False, export_normals=True, export_materials='EXPORT', export_cameras=False, export_lights=False)
print('exported', OUT)
