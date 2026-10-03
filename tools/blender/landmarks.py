# Hero landmarks modelled procedurally in Blender and exported as one GLB:
#   python landmarks.py <out.glb> [preview.png] [only=name,name]
# Game frame: +y up, +z forward (the landmark's heading), origin at ground level in the middle.
# Religious buildings are modelled as similar silhouettes without any symbols (finials are plain balls).
import os, sys, math, json, time, bpy, bmesh
from mathutils import Vector, Matrix

ARGS = [a for a in sys.argv if a.endswith('.glb') or a.endswith('.png')]
OUT = next((a for a in ARGS if a.endswith('.glb')), 'landmarks.glb')
PREVIEW = next((a for a in ARGS if a.endswith('.png')), None)
ONLY = next((a.split('=')[1].split(',') for a in sys.argv if a.startswith('only=')), None)

bpy.ops.wm.read_factory_settings(use_empty=True)
SC = bpy.context.scene


def V(p):  # game -> Blender
    return Vector((p[0], -p[2], p[1]))


MDEF = {
    'stone': ((0.86, 0.85, 0.8), 0.8, 0.0),
    'stoneDark': ((0.7, 0.69, 0.64), 0.85, 0.0),
    'brick': ((0.52, 0.22, 0.14), 0.85, 0.0),
    'plaster': ((0.86, 0.78, 0.58), 0.8, 0.0),
    'trim': ((0.92, 0.91, 0.87), 0.7, 0.0),
    'roofGreen': ((0.12, 0.36, 0.28), 0.45, 0.35),
    'domeBlue': ((0.1, 0.42, 0.62), 0.3, 0.5),
    'domeTeal': ((0.1, 0.5, 0.5), 0.3, 0.5),
    'gold': ((0.85, 0.65, 0.28), 0.25, 1.0),
    'window': ((0.04, 0.05, 0.06), 0.15, 0.3),
    'glass': ((0.12, 0.2, 0.26), 0.06, 0.6),
    'lattice': ((0.9, 0.9, 0.88), 0.4, 0.3),
    'grass': ((0.18, 0.3, 0.1), 0.95, 0.0),
    'paving': ((0.5, 0.49, 0.46), 0.85, 0.0),
    'concrete': ((0.62, 0.62, 0.6), 0.85, 0.0),
    'steel': ((0.55, 0.57, 0.6), 0.4, 0.8),
}
MLIST = list(MDEF)
MATS = {}
for name, (rgb, rough, metal) in MDEF.items():
    m = bpy.data.materials.new('lm_' + name)
    m.use_nodes = True
    b = m.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = (*rgb, 1)
    b.inputs['Roughness'].default_value = rough
    b.inputs['Metallic'].default_value = metal
    MATS[name] = m


class Buf:
    def __init__(self):
        self.v, self.f, self.m, self.s = [], [], [], []

    def add(self, p):
        self.v.append(tuple(p))
        return len(self.v) - 1

    def face(self, idx, mname, smooth=False):
        self.f.append(list(idx))
        self.m.append(MLIST.index(mname))
        self.s.append(smooth)

    def face_out(self, idx, mname, ref):
        """Face oriented so that its normal points away from a reference point."""
        p = [Vector(self.v[i]) for i in idx]
        n = (p[1] - p[0]).cross(p[2] - p[0])
        c = sum(p, Vector()) / len(p)
        self.face(idx if n.dot(c - Vector(ref)) >= 0 else list(reversed(idx)), mname)

    def obj(self, name, smooth=False):
        me = bpy.data.meshes.new(name)
        me.from_pydata([V(p) for p in self.v], [], self.f)
        for n in MLIST:
            me.materials.append(MATS[n])
        for p, k, sm in zip(me.polygons, self.m, self.s):
            p.material_index = k
            p.use_smooth = sm
        me.update()
        o = bpy.data.objects.new(name, me)
        SC.collection.objects.link(o)
        return o


class L:
    """Placement helper with an optional local transform (offset and rotation about y)."""

    def __init__(self, b, ox=0, oz=0, rot=0, oy=0):
        self.b, self.ox, self.oz, self.rot, self.oy = b, ox, oz, rot, oy

    def T(self, x, y, z):
        c, s = math.cos(self.rot), math.sin(self.rot)
        return (self.ox + x * c + z * s, self.oy + y, self.oz - x * s + z * c)

    def at(self, x, z, rot=0, y=0):
        return L(self.b, *self.T(x, 0, z)[0:1], self.T(x, 0, z)[2], self.rot + rot, self.oy + y)

    def box(self, x, y, z, w, h, d, m, rot=0):
        b = self.b
        c, s = math.cos(rot), math.sin(rot)
        ids = []
        for sx in (-1, 1):
            for sy in (0, 1):
                for sz in (-1, 1):
                    lx, lz = sx * w / 2, sz * d / 2
                    ids.append(b.add(self.T(x + lx * c + lz * s, y + sy * h, z - lx * s + lz * c)))
        for q in ((0, 1, 3, 2), (4, 6, 7, 5), (0, 4, 5, 1), (2, 3, 7, 6), (0, 2, 6, 4), (1, 5, 7, 3)):
            b.face([ids[i] for i in q], m)

    def lathe(self, x, z, y, prof, n, m, cap_top=True):
        """Surface of revolution; prof = [(radius, height)], bottom to top."""
        b = self.b
        rings = []
        for r, h in prof:
            if r < 1e-4:
                rings.append([b.add(self.T(x, y + h, z))] * n)
            else:
                rings.append([b.add(self.T(x + math.sin(2 * math.pi * k / n) * r, y + h, z + math.cos(2 * math.pi * k / n) * r)) for k in range(n)])
        for i in range(len(prof) - 1):
            for k in range(n):
                k2 = (k + 1) % n
                a, bb, c, d = rings[i][k], rings[i][k2], rings[i + 1][k2], rings[i + 1][k]
                if a == bb:
                    b.face([a, c, d], m, True)
                elif c == d:
                    b.face([a, bb, c], m, True)
                else:
                    b.face([a, bb, c, d], m, True)
        if cap_top and prof[-1][0] > 1e-4:
            b.face(rings[-1], m)
        return rings

    def prism(self, x, z, y, r, h, n, m, rot0=0, top=None):
        """n-sided prism (octagonal tiers etc.)."""
        b = self.b
        lo = [b.add(self.T(x + math.sin(rot0 + 2 * math.pi * k / n) * r, y, z + math.cos(rot0 + 2 * math.pi * k / n) * r)) for k in range(n)]
        hi = [b.add(self.T(x + math.sin(rot0 + 2 * math.pi * k / n) * r, y + h, z + math.cos(rot0 + 2 * math.pi * k / n) * r)) for k in range(n)]
        for k in range(n):
            k2 = (k + 1) % n
            b.face([lo[k], lo[k2], hi[k2], hi[k]], m)
        b.face(hi, top or m)

    def tent(self, x, z, y, r, h, n, m, rot0=0):
        b = self.b
        base = [b.add(self.T(x + math.sin(rot0 + 2 * math.pi * k / n) * r, y, z + math.cos(rot0 + 2 * math.pi * k / n) * r)) for k in range(n)]
        apex = b.add(self.T(x, y + h, z))
        for k in range(n):
            b.face([base[k], base[(k + 1) % n], apex], m)

    def ball(self, x, z, y, r, m, n=10):
        prof = [(0, -r)] + [(r * math.sin(math.pi * i / 6), -r * math.cos(math.pi * i / 6)) for i in range(1, 6)] + [(0, r)]
        self.lathe(x, z, y + r, prof, n, m, False)

    def onion(self, x, z, y, r, h, m, n=16):
        """Onion dome on a drum top: bulge then a pointed tip."""
        prof = [(r * 0.82, 0), (r * 1.0, h * 0.18), (r * 1.06, h * 0.32), (r * 0.98, h * 0.48), (r * 0.72, h * 0.64), (r * 0.36, h * 0.8), (r * 0.12, h * 0.92), (0, h)]
        self.lathe(x, z, y, prof, n, m, False)

    def dome(self, x, z, y, r, h, m, n=20, point=0.0):
        prof = [(r * math.cos(a), h * math.sin(a)) for a in [math.pi / 2 * i / 7 for i in range(7)]]
        prof.append((0, h + point))
        self.lathe(x, z, y, prof, n, m, False)

    # dark window panels on a wall plane: along the local x axis at depth z, facing +z (outward when sign=+1)
    def windows_x(self, x0, x1, z, y0, y1, count, w, h, m='window', sign=1, arch=False):
        for i in range(count):
            cx = x0 + (x1 - x0) * (i + 0.5) / count
            self.box(cx, y0, z + sign * 0.06, w, h, 0.12, m)
            if arch:
                self.box(cx, y0 + h, z + sign * 0.06, w * 0.7, w * 0.25, 0.12, m)

    def windows_z(self, z0, z1, x, y0, y1, count, w, h, m='window', sign=1, arch=False):
        for i in range(count):
            cz = z0 + (z1 - z0) * (i + 0.5) / count
            self.box(x + sign * 0.06, y0, cz, 0.12, h, w, m)
            if arch:
                self.box(x + sign * 0.06, y0 + h, cz, 0.12, w * 0.25, w * 0.7, m)


# ---------- Kazan kremlin ensemble ----------
def wall_run(l, p0, p1, y, h, t, m):
    (x0, z0), (x1, z1) = p0, p1
    length = math.hypot(x1 - x0, z1 - z0)
    rot = math.atan2(x1 - x0, z1 - z0) - math.pi / 2
    cx, cz = (x0 + x1) / 2, (z0 + z1) / 2
    l.box(cx, y, cz, length, h, t, m, rot)
    # parapet with rectangular embrasures
    n = int(length / 3.2)
    for i in range(n):
        k = (i + 0.5) / n
        px, pz = x0 + (x1 - x0) * k, z0 + (z1 - z0) * k
        l.box(px, y + h, pz, 2.0, 1.3, t * 0.55, m, rot)
    # a band of small loopholes along the outer face
    fx, fz = (z1 - z0) / length, -(x1 - x0) / length
    for i in range(1, n):
        k = i / n
        px, pz = x0 + (x1 - x0) * k + fx * (t / 2 + 0.03), z0 + (z1 - z0) * k + fz * (t / 2 + 0.03)
        l.box(px, y + h * 0.55, pz, 0.5, 0.9, 0.1, 'window', rot)


def round_tower(l, x, z, r, h, roof_h, m='stone', roof='roofGreen'):
    l.lathe(x, z, 0, [(r * 1.08, 0), (r * 1.0, 2.0), (r, h), (r * 1.06, h + 0.6), (r * 1.06, h + 1.2)], 16, m)
    l.tent(x, z, h + 1.2, r * 1.15, roof_h, 16, roof)
    l.ball(x, z, h + 1.2 + roof_h - 0.2, 0.45, 'gold', 8)
    for k in range(4):
        a = k * math.pi / 2 + 0.4
        l.box(x + math.sin(a) * (r + 0.04), h * 0.62, z + math.cos(a) * (r + 0.04), 0.6, 1.2, 0.14, 'window', a)


def spasskaya(l, x, z):
    """Main gate tower: square tiers, an octagon and a tented spire."""
    l.box(x, 0, z, 14, 18, 14, 'stone')
    l.box(x, 0, z, 6, 9, 14.4, 'stoneDark')  # gate passage
    l.box(x, 18, z, 15, 1.0, 15, 'trim')
    l.box(x, 19, z, 10, 8, 10, 'stone')
    l.windows_x(x - 4, x + 4, z + 5, 21, 25, 2, 1.4, 3, sign=1, arch=True)
    l.box(x, 27, z, 11, 0.8, 11, 'trim')
    l.prism(x, z, 27.8, 4.4, 7, 8, 'stone', rot0=math.pi / 8)
    l.prism(x, z, 34.8, 4.8, 0.6, 8, 'trim', rot0=math.pi / 8)
    l.tent(x, z, 35.4, 4.4, 15, 8, 'roofGreen', rot0=math.pi / 8)
    l.ball(x, z, 50, 0.7, 'gold', 8)


def syuyumbike(l, x, z):
    """Leaning tiered tower: red brick tiers with white trim and a green spire."""
    y = 0
    tiers = [(14, 10, 4), (11.5, 8.5, 4), (9.5, 7, 4), (7.6, 6, 8), (6.2, 5.2, 8), (5.0, 4.6, 8)]
    for w, h, sides in tiers:
        if sides == 4:
            l.box(x, y, z, w, h, w, 'brick')
            l.box(x, y + h, z, w + 0.7, 0.6, w + 0.7, 'trim')
            for k in range(4):
                a = k * math.pi / 2
                l.box(x + math.sin(a) * (w / 2 + 0.05), y + h * 0.35, z + math.cos(a) * (w / 2 + 0.05), w * 0.22, h * 0.45, 0.12, 'window', a)
        else:
            l.prism(x, z, y, w / 2, h, 8, 'brick', math.pi / 8)
            l.prism(x, z, y + h, w / 2 + 0.35, 0.5, 8, 'trim', math.pi / 8)
            for k in range(8):
                a = math.pi / 8 + k * math.pi / 4
                l.box(x + math.sin(a) * (w / 2 * 0.93), y + h * 0.3, z + math.cos(a) * (w / 2 * 0.93), w * 0.16, h * 0.45, 0.12, 'window', a)
        y += h + 0.6
    l.prism(x, z, y, 2.0, 3.0, 8, 'brick', math.pi / 8)
    l.tent(x, z, y + 3.0, 2.4, 16, 8, 'roofGreen', math.pi / 8)
    l.ball(x, z, y + 18.6, 0.7, 'gold', 8)


def blue_mosque_like(l, x, z):
    """A large white building with a turquoise main dome and four tall slender towers, without any symbols."""
    W, D = 34, 34
    l.box(x, 0, z, W + 6, 1.6, D + 6, 'stoneDark')  # podium
    l.box(x, 1.6, z, W, 16, D, 'stone')
    for side in (-1, 1):
        l.windows_x(x - W / 2 + 3, x + W / 2 - 3, z + side * (D / 2), 5, 13, 6, 1.6, 5.5, sign=side, arch=True)
        l.windows_z(z - D / 2 + 3, z + D / 2 - 3, x + side * (W / 2), 5, 13, 6, 1.6, 5.5, sign=side, arch=True)
    # corner pavilions with small domes
    for cx in (-1, 1):
        for cz in (-1, 1):
            px, pz = x + cx * (W / 2 - 3), z + cz * (D / 2 - 3)
            l.prism(px, pz, 17.6, 3.2, 3, 8, 'stone', math.pi / 8)
            l.dome(px, pz, 20.6, 3.2, 3.6, 'domeTeal', 14, 1.0)
    # drum and the main dome
    l.box(x, 17.6, z, 22, 1.0, 22, 'trim')
    l.lathe(x, z, 18.6, [(9.5, 0), (9.5, 7)], 24, 'stone', False)
    for k in range(12):
        a = 2 * math.pi * k / 12
        l.box(x + math.sin(a) * 9.55, 20.5, z + math.cos(a) * 9.55, 1.4, 3.6, 0.12, 'window', a)
    l.lathe(x, z, 25.6, [(10.2, 0), (10.6, 1.2), (10.3, 4), (9.0, 8), (6.6, 12), (3.4, 15), (1.0, 16.4), (0, 17.6)], 28, 'domeTeal', False)
    l.lathe(x, z, 43, [(0.25, 0), (0.25, 3)], 6, 'gold', False)
    l.ball(x, z, 46, 0.8, 'gold', 10)
    # four tall towers with balconies and tented tops
    for cx in (-1, 1):
        for cz in (-1, 1):
            px, pz = x + cx * (W / 2 + 7), z + cz * (D / 2 + 7)
            l.prism(px, pz, 0, 3.0, 6, 8, 'stone', math.pi / 8)
            l.lathe(px, pz, 6, [(2.6, 0), (2.4, 26), (2.0, 34)], 12, 'stone', False)
            l.lathe(px, pz, 30, [(2.4, 0), (3.6, 0.6), (3.6, 1.2), (2.3, 1.4)], 12, 'trim', False)
            l.lathe(px, pz, 39, [(2.0, 0), (3.0, 0.5), (3.0, 1.0), (1.9, 1.2)], 12, 'trim', False)
            l.lathe(px, pz, 40, [(1.9, 0), (1.9, 4)], 12, 'stone', False)
            l.tent(px, pz, 44, 2.3, 10, 12, 'domeTeal')
            l.ball(px, pz, 53.6, 0.5, 'gold', 8)
            # connecting galleries to the building
            l.box((px + x + cx * (W / 2)) / 2, 1.6, (pz + z + cz * (D / 2)) / 2, 6, 7, 6, 'stone', math.pi / 4 * cx * cz)


def white_cathedral_like(l, x, z):
    """White hall with five blue onion domes on drums (no crosses), plus a tiered bell tower."""
    l.box(x, 0, z, 22, 14, 30, 'stone')
    l.box(x, 14, z, 23, 0.8, 31, 'trim')
    for side in (-1, 1):
        l.windows_z(z - 13, z + 13, x + side * 11, 3, 10, 5, 1.4, 4.4, sign=side, arch=True)
    l.windows_x(x - 8, x + 8, z - 15, 3, 10, 3, 1.4, 4.4, sign=-1, arch=True)
    l.lathe(x - 8.5, z, 0, [(4.5, 0), (4.5, 10)], 16, 'stone')  # apse
    l.box(x, 14.8, z, 22, 2.2, 30, 'roofGreen')
    domes = [(0, 0, 4.4, 8, 9.5), (-6, -8, 2.8, 5, 6), (6, -8, 2.8, 5, 6), (-6, 8, 2.8, 5, 6), (6, 8, 2.8, 5, 6)]
    for dx, dz, r, dh, oh in domes:
        l.lathe(x + dz * 0.6, z + dx, 17, [(r, 0), (r, dh)], 16, 'stone', False)
        for k in range(8):
            a = 2 * math.pi * k / 8
            l.box(x + dz * 0.6 + math.sin(a) * (r + 0.02), 17 + dh * 0.3, z + dx + math.cos(a) * (r + 0.02), 0.6, dh * 0.4, 0.1, 'window', a)
        l.onion(x + dz * 0.6, z + dx, 17 + dh, r * 1.12, oh, 'domeBlue')
        l.ball(x + dz * 0.6, z + dx, 17 + dh + oh, 0.4, 'gold', 8)


def palace(l, x, z, rot=0):
    """Governor's palace: long two-storey block with arched windows, risalits and a central tower."""
    p = l.at(x, z, rot)
    p.box(0, 0, 0, 70, 15, 16, 'plaster')
    p.box(0, 15, 0, 71, 0.7, 17, 'trim')
    p.box(0, 15.7, 0, 70, 3.2, 16, 'roofGreen')
    for side in (-1, 1):
        p.windows_x(-33, 33, side * 8, 2, 6, 16, 1.5, 3.2, sign=side, arch=True)
        p.windows_x(-33, 33, side * 8, 9, 13, 16, 1.5, 3.2, sign=side, arch=True)
    for u in (-26, 0, 26):
        p.box(u, 0, 0, 10, 17, 18, 'plaster')
        p.box(u, 17, 0, 10.6, 0.7, 18.6, 'trim')
    p.box(0, 17.7, 0, 7, 8, 7, 'plaster')
    p.tent(0, 0, 25.7, 5, 7, 4, 'roofGreen', math.pi / 4)
    p.ball(0, 0, 32.4, 0.5, 'gold', 8)


def kazan_kremlin():
    b = Buf()
    l = L(b)
    # hill plateau: grass with paved walks, slopes outside the walls
    outline = [(-58, 96), (16, 104), (62, 40), (54, -46), (10, -104), (-44, -84), (-70, 6)]
    cx = sum(p[0] for p in outline) / len(outline)
    cz = sum(p[1] for p in outline) / len(outline)
    top = 3.5
    ring_top = [b.add((x, top, z)) for x, z in outline]
    ring_bot = [b.add((cx + (x - cx) * 1.16, -0.4, cz + (z - cz) * 1.16)) for x, z in outline]
    centre = b.add((cx, top, cz))
    for i in range(len(outline)):
        j = (i + 1) % len(outline)
        b.face_out([centre, ring_top[j], ring_top[i]], 'grass', (cx, -50, cz))
        b.face_out([ring_bot[i], ring_bot[j], ring_top[j], ring_top[i]], 'grass', (cx, -20, cz))
    up = L(b, oy=top)
    # paved walks between the main buildings
    up.box(-6, 0.02, 0, 10, 0.1, 150, 'paving')
    up.box(0, 0.02, 30, 80, 0.1, 9, 'paving')
    # walls and round towers along the outline
    for i in range(len(outline)):
        p0, p1 = outline[i], outline[(i + 1) % len(outline)]
        wall_run(up, p0, p1, 0, 8.5, 3.0, 'stone')
        round_tower(up, p0[0], p0[1], 5.4, 14, 9)
        if math.hypot(p1[0] - p0[0], p1[1] - p0[1]) > 90:
            mx, mz = (p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2
            up.box(mx, 0, mz, 9, 15, 9, 'stone')
            up.tent(mx, mz, 15, 6.8, 9, 4, 'roofGreen', math.pi / 4)
    spasskaya(up, -20, 92)
    syuyumbike(up, 30, -20)
    blue_mosque_like(up, -12, -46)
    white_cathedral_like(up, 10, 24)
    palace(up, 40, 52, -0.5)
    o = b.obj('kazanKremlin')
    o['landmark'] = json.dumps({'radius': 120, 'lift': 0})
    return o


def family_center():
    """'The Bowl': a ribbed stem carrying a wide bowl wrapped in a white diagrid with glazing."""
    b = Buf()
    l = L(b)
    l.box(0, 0, 0, 44, 1.2, 44, 'paving')
    # stem with vertical ribs
    l.lathe(0, 0, 1.2, [(11, 0), (9.6, 6), (8.4, 20), (8.4, 34), (9.4, 42)], 24, 'glass', False)
    for k in range(24):
        a = 2 * math.pi * (k + 0.5) / 24
        for y0, y1, r0, r1 in ((1.2, 7.2, 11.1, 9.7), (7.2, 21.2, 9.7, 8.5), (21.2, 35.2, 8.5, 8.5), (35.2, 43.2, 8.5, 9.5)):
            ym = (y0 + y1) / 2
            rm = (r0 + r1) / 2
            l.box(math.sin(a) * rm, y0, math.cos(a) * rm, 0.5, y1 - y0, 0.5, 'lattice', a)
    # bowl: glass shell with a diagrid
    prof = [(9.4, 0), (14, 4), (20, 8), (26, 12.5), (30, 16.5), (32.5, 19.5), (33.5, 22)]
    y0 = 42.6
    l.lathe(0, 0, y0, prof, 40, 'glass', False)
    n = 40
    for i in range(len(prof) - 1):
        r0, h0 = prof[i]
        r1, h1 = prof[i + 1]
        for k in range(n):
            for d in (-1, 1):
                a0 = 2 * math.pi * k / n
                a1 = a0 + d * 2 * math.pi / n
                p0 = (math.sin(a0) * (r0 + 0.25), y0 + h0, math.cos(a0) * (r0 + 0.25))
                p1 = (math.sin(a1) * (r1 + 0.25), y0 + h1, math.cos(a1) * (r1 + 0.25))
                strut(b, p0, p1, 0.18, 'lattice')
    # roof rim, observation terrace and the deck
    l.lathe(0, 0, y0 + 22, [(33.5, 0), (34.6, 0.3), (34.6, 1.4), (33.0, 1.6)], 40, 'lattice', False)
    l.lathe(0, 0, y0 + 23.4, [(33.0, 0), (0, 0.4)], 40, 'concrete', False)
    l.lathe(0, 0, y0 + 23.8, [(31, 0), (31, 1.1)], 40, 'glass', False)
    o = b.obj('familyCenter')
    o['landmark'] = json.dumps({'radius': 36, 'lift': 0, 'h': 68})
    return o


def strut(b, p0, p1, r, m):
    """Square beam between two points."""
    p0, p1 = Vector(p0), Vector(p1)
    t = (p1 - p0).normalized()
    up = Vector((0, 1, 0)) if abs(t.y) < 0.9 else Vector((1, 0, 0))
    n1 = t.cross(up).normalized() * r
    n2 = t.cross(n1).normalized() * r
    a = [b.add(p0 + n1 * sx + n2 * sy) for sx, sy in ((1, 1), (-1, 1), (-1, -1), (1, -1))]
    c = [b.add(p1 + n1 * sx + n2 * sy) for sx, sy in ((1, 1), (-1, 1), (-1, -1), (1, -1))]
    mid = (p0 + p1) / 2
    for k in range(4):
        k2 = (k + 1) % 4
        b.face_out([a[k], a[k2], c[k2], c[k]], m, mid)


def fix(o):
    pass


BUILDERS = {'kazanKremlin': kazan_kremlin, 'familyCenter': family_center}
built = []
for name, fn in BUILDERS.items():
    if ONLY and name not in ONLY:
        continue
    o = fn()
    fix(o)
    built.append(o)
    print(name, sum(len(p.vertices) - 2 for p in o.data.polygons), 'tris')

if PREVIEW:
    for o in built:
        for x in built:
            x.hide_render = x is not o
        spec = json.loads(o['landmark'])
        r = max(spec['radius'], spec.get('h', 0))
        cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam'))
        SC.collection.objects.link(cam)
        cam.location = Vector((r * 1.5, -r * 2.0, r * 0.9))
        target = Vector((0, 0, r * 0.18))
        cam.rotation_euler = (target - cam.location).to_track_quat('-Z', 'Y').to_euler()
        cam.data.lens = 35
        cam.data.clip_end = 2000
        SC.camera = cam
        if 'sun' not in bpy.data.objects:
            sun = bpy.data.objects.new('sun', bpy.data.lights.new('sun', 'SUN'))
            sun.data.energy = 4
            sun.rotation_euler = (math.radians(50), 0, math.radians(30))
            SC.collection.objects.link(sun)
            w = bpy.data.worlds.new('w')
            SC.world = w
            w.use_nodes = True
            sky = w.node_tree.nodes.new('ShaderNodeTexSky')
            w.node_tree.links.new(sky.outputs[0], w.node_tree.nodes['Background'].inputs[0])
            w.node_tree.nodes['Background'].inputs[1].default_value = 0.35
            g = bpy.data.objects.new('ground', bpy.data.meshes.new('ground'))
            g.data.from_pydata([(-600, -600, -0.5), (600, -600, -0.5), (600, 600, -0.5), (-600, 600, -0.5)], [], [(0, 1, 2, 3)])
            g.data.materials.append(MATS['grass'])
            SC.collection.objects.link(g)
        SC.render.engine = 'CYCLES'
        SC.cycles.samples = 24
        SC.cycles.device = 'CPU'
        SC.render.resolution_x = 1200
        SC.render.resolution_y = 700
        SC.view_settings.view_transform = 'AgX'
        SC.render.filepath = PREVIEW.replace('.png', '-' + o.name + '.png')
        t = time.time()
        bpy.ops.render.render(write_still=True)
        print('render', o.name, round(time.time() - t, 1))
        bpy.data.objects.remove(cam)
    for n in ('sun', 'ground'):
        if n in bpy.data.objects:
            bpy.data.objects.remove(bpy.data.objects[n])
    for o in built:
        o.hide_render = False

bpy.ops.export_scene.gltf(filepath=OUT, export_format='GLB', export_extras=True, export_yup=True, export_texcoords=False, export_normals=True, export_materials='EXPORT', export_cameras=False, export_lights=False)
print('exported', OUT)
