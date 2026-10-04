# Truck tractor lineup, built procedurally in Blender:
#   python tractors.py <out_dir> [preview.png] [only=id,id] [lo] [views=front34,side,...]
# One GLB per truck (game/assets/trucks/<id>.glb) with separate wheel/steering/mirror/gauge/interior nodes, plus a
# merged low-detail set for traffic. Silhouettes recall real trucks; names are fictional and there are no logos.
# Game frame: +y up, +z forward, +x the driver's (left) side; origin on the ground under the rear axle
# (or the middle of the tandem).
import os, sys, math, json, time, bpy, bmesh
from mathutils import Vector

ARGS = [a for a in sys.argv if a.endswith('.png')]
PREVIEW = ARGS[0] if ARGS else None
OUT = next((a for a in sys.argv[1:] if not a.endswith('.png') and not a.endswith('.py') and '=' not in a and a not in ('lo', 'cull')), 'trucks')
ONLY = next((a.split('=')[1].split(',') for a in sys.argv if a.startswith('only=')), None)
VIEWS = next((a.split('=')[1].split(',') for a in sys.argv if a.startswith('views=')), None)
LO = 'lo' in sys.argv
CULL = 'cull' in sys.argv
os.makedirs(OUT, exist_ok=True)


def V(p):
    return Vector((p[0], -p[2], p[1]))


def G(v):
    return Vector((v.x, v.z, -v.y))


# ---------- materials ----------
MDEF = {
    'paint': ((0.8, 0.8, 0.8), 0.3, 0.25),
    'paint2': ((0.2, 0.21, 0.22), 0.4, 0.2),
    'trim': ((0.02, 0.02, 0.022), 0.45, 0.0),
    'plastic': ((0.035, 0.035, 0.037), 0.75, 0.0),
    'grille': ((0.012, 0.012, 0.014), 0.5, 0.2),
    'chrome': ((0.85, 0.85, 0.87), 0.08, 1.0),
    'darkchrome': ((0.25, 0.26, 0.28), 0.18, 1.0),
    'frit': ((0.01, 0.01, 0.012), 0.12, 0.0),
    'rubber': ((0.015, 0.015, 0.015), 0.85, 0.0),
    'glass': ((0.03, 0.04, 0.05), 0.04, 0.2),
    'lens': ((0.6, 0.62, 0.65), 0.05, 0.2),
    'head': ((0.9, 0.9, 0.88), 0.12, 0.7),
    'drl': ((0.9, 0.92, 0.95), 0.2, 0.0),
    'tail': ((0.5, 0.02, 0.02), 0.15, 0.1),
    'ind_L': ((0.8, 0.38, 0.03), 0.15, 0.1),
    'ind_R': ((0.8, 0.38, 0.03), 0.15, 0.1),
    'marker': ((0.85, 0.42, 0.05), 0.2, 0.1),
    'reverse': ((0.85, 0.85, 0.85), 0.15, 0.1),
    'steel': ((0.045, 0.045, 0.05), 0.6, 0.4),
    'alu': ((0.75, 0.76, 0.78), 0.25, 0.9),
    'tyre': ((0.022, 0.022, 0.022), 0.9, 0.0),
    'rim': ((0.8, 0.81, 0.82), 0.22, 0.9),
    'rimdark': ((0.04, 0.04, 0.045), 0.6, 0.3),
    'mirror_glass': ((0.8, 0.82, 0.85), 0.02, 1.0),
    'gauges': ((0.02, 0.02, 0.02), 0.3, 0.0),
    'dash': ((0.075, 0.077, 0.082), 0.78, 0.0),
    'dash2': ((0.2, 0.2, 0.21), 0.72, 0.0),
    'dashtrim': ((0.42, 0.43, 0.45), 0.35, 0.8),
    'panel': ((0.36, 0.35, 0.33), 0.8, 0.0),
    'headliner': ((0.58, 0.56, 0.52), 0.92, 0.0),
    'seat': ((0.09, 0.092, 0.1), 0.88, 0.0),
    'seat2': ((0.26, 0.24, 0.22), 0.85, 0.0),
    'leather': ((0.025, 0.025, 0.025), 0.55, 0.0),
    'carpet': ((0.035, 0.035, 0.035), 0.95, 0.0),
    'curtain': ((0.1, 0.11, 0.13), 0.9, 0.0),
    'display': ((0.01, 0.015, 0.02), 0.1, 0.0),
    'button': ((0.08, 0.08, 0.085), 0.5, 0.0),
    'seam': ((0.008, 0.008, 0.008), 0.8, 0.0),
    'plate': ((0.85, 0.85, 0.83), 0.5, 0.0),
    'ink': ((0.01, 0.01, 0.01), 0.6, 0.0),
    'badge': ((0.8, 0.8, 0.82), 0.12, 1.0),
    'airRed': ((0.6, 0.05, 0.04), 0.5, 0.0),
    'airYellow': ((0.75, 0.55, 0.05), 0.5, 0.0),
    'adblue': ((0.05, 0.2, 0.55), 0.5, 0.0),
}
MLIST = list(MDEF)
MATS = {}
for name, (rgb, rough, metal) in MDEF.items():
    m = bpy.data.materials.new('MAT-' + name)
    m.use_nodes = True
    bsdf = m.node_tree.nodes['Principled BSDF']
    bsdf.inputs['Base Color'].default_value = (*rgb, 1)
    bsdf.inputs['Roughness'].default_value = rough
    bsdf.inputs['Metallic'].default_value = metal
    if name == 'gauges':
        bsdf.inputs['Emission Color'].default_value = (0.35, 0.4, 0.45, 1)
        bsdf.inputs['Emission Strength'].default_value = 1.0
    if name in ('glass', 'lens'):
        bsdf.inputs['Transmission Weight'].default_value = 0.92 if name == 'glass' else 1.0
        if name == 'lens':
            bsdf.inputs['Base Color'].default_value = (1, 1, 1, 1)
            bsdf.inputs['Roughness'].default_value = 0.02
    MATS[name] = m


class Buf:
    def __init__(self):
        self.v, self.f, self.m, self.s, self.uv = [], [], [], [], {}

    def add(self, p):
        self.v.append(Vector(p))
        return len(self.v) - 1

    def face(self, idx, mat, smooth=False, uvs=None):
        self.f.append(list(idx))
        self.m.append(MLIST.index(mat))
        self.s.append(smooth)
        if uvs:
            self.uv[len(self.f) - 1] = uvs
        return list(idx)

    def face_out(self, idx, mat, ref, smooth=False, uvs=None):
        p = [self.v[i] for i in idx]
        n = Vector((0, 0, 0))
        for k in range(len(p)):
            n += p[k].cross(p[(k + 1) % len(p)])
        c = sum(p, Vector()) / len(p)
        flip = n.dot(c - Vector(ref)) < 0
        if flip:
            idx = list(reversed(idx))
            if uvs:
                uvs = list(reversed(uvs))
        return self.face(idx, mat, smooth, uvs)

    def obj(self, name, sharp=0.75):
        me = bpy.data.meshes.new(name)
        me.from_pydata([V(p) for p in self.v], [], self.f)
        for n in MLIST:
            me.materials.append(MATS[n])
        for p, k, sm in zip(me.polygons, self.m, self.s):
            p.material_index = k
            p.use_smooth = sm
        if self.uv:
            layer = me.uv_layers.new(name='UVMap')
            for fi, uvs in self.uv.items():
                poly = me.polygons[fi]
                for k, li in enumerate(poly.loop_indices):
                    layer.data[li].uv = uvs[k]
        me.update()
        if sharp:
            me.set_sharp_from_angle(angle=sharp)
        o = bpy.data.objects.new(name, me)
        bpy.context.scene.collection.objects.link(o)
        return o


def lerp(a, b, t):
    return a + (b - a) * t


def rot_vec(v, rot_y=0.0, rot_x=0.0, rot_z=0.0):
    x, y, z = v
    if rot_z:
        c, s = math.cos(rot_z), math.sin(rot_z)
        x, y = x * c - y * s, x * s + y * c
    if rot_x:
        c, s = math.cos(rot_x), math.sin(rot_x)
        y, z = y * c - z * s, y * s + z * c
    if rot_y:
        c, s = math.cos(rot_y), math.sin(rot_y)
        x, z = x * c + z * s, -x * s + z * c
    return Vector((x, y, z))


# ---------- primitives (game frame) ----------
def box(b, c, s, mat, rot_y=0.0, rot_x=0.0, rot_z=0.0):
    hx, hy, hz = s[0] / 2, s[1] / 2, s[2] / 2
    C = Vector(c)
    ids = []
    for ax in (-1, 1):
        for ay in (-1, 1):
            for az in (-1, 1):
                ids.append(b.add(C + rot_vec((ax * hx, ay * hy, az * hz), rot_y, rot_x, rot_z)))
    for q in ((0, 1, 3, 2), (4, 6, 7, 5), (0, 4, 5, 1), (2, 3, 7, 6), (0, 2, 6, 4), (1, 5, 7, 3)):
        b.face_out([ids[i] for i in q], mat, C)


def rrect_ring(hx, hz, r, n=3):
    """Rounded rectangle in the x-z plane (closed list of (x, z))."""
    r = max(0.0015, min(r, hx * 0.999, hz * 0.999))
    pts = []
    for cx, cz, a0 in ((hx - r, hz - r, 0.0), (-hx + r, hz - r, 90.0), (-hx + r, -hz + r, 180.0), (hx - r, -hz + r, 270.0)):
        for k in range(n + 1):
            a = math.radians(a0 + 90.0 * k / n)
            pts.append((cx + math.cos(a) * r, cz + math.sin(a) * r))
    return pts


def rbox(b, c, s, r, mat, rot_y=0.0, rot_x=0.0, rot_z=0.0, n=3, smooth=True, basis=None, cap_mat=None, bottom=True):
    """Rounded box: every edge bevelled with radius r. basis = (ex, ey, ez) replaces the rotations."""
    hx, hy, hz = s[0] / 2, s[1] / 2, s[2] / 2
    r = min(r, hx * 0.95, hy * 0.95, hz * 0.95)
    C = Vector(c)

    def tf(p):
        if basis:
            ex, ey, ez = basis
            return C + ex * p[0] + ey * p[1] + ez * p[2]
        return C + rot_vec(p, rot_y, rot_x, rot_z)

    levels = []
    for k in range(n + 1):
        a = math.pi / 2 * k / n
        levels.append((-hy + r - r * math.cos(a), r - r * math.sin(a)))
    for k in range(n + 1):
        a = math.pi / 2 * k / n
        levels.append((hy - r + r * math.sin(a), r - r * math.cos(a)))
    rings = []
    for y, inset in levels:
        ring = rrect_ring(hx - inset, hz - inset, max(0.0015, r - inset), n)
        rings.append([b.add(tf((x, y, z))) for x, z in ring])
    m = len(rings[0])
    for i in range(len(rings) - 1):
        for j in range(m):
            j2 = (j + 1) % m
            b.face_out([rings[i][j], rings[i][j2], rings[i + 1][j2], rings[i + 1][j]], mat, C, smooth)
    for ring, sign in ((rings[0], -1), (rings[-1], 1)):
        if sign < 0 and not bottom:
            continue
        cc = b.add(tf((0, sign * hy, 0)))
        for j in range(m):
            b.face_out([cc, ring[j], ring[(j + 1) % m]], cap_mat if (cap_mat and sign > 0) else mat, C, smooth)
    return rings


def lathe(b, c, axis, prof, n, mat, smooth=True, caps=False, a0=0.0, basis=None, ref=None):
    """Surface of revolution around an axis ('x', 'y', 'z' or a basis) through c; prof = [(r, t)] along the axis.
    Faces point away from ref (default: the middle of the profile on the axis, right for closed and tube shapes)."""
    C = Vector(c)
    if basis:
        eu, ew, et = basis
    elif axis == 'x':
        eu, ew, et = Vector((0, 1, 0)), Vector((0, 0, 1)), Vector((1, 0, 0))
    elif axis == 'y':
        eu, ew, et = Vector((0, 0, 1)), Vector((1, 0, 0)), Vector((0, 1, 0))
    else:
        eu, ew, et = Vector((1, 0, 0)), Vector((0, 1, 0)), Vector((0, 0, 1))
    rings = []
    for r, t in prof:
        ring = []
        for k in range(n):
            a = a0 + 2 * math.pi * k / n
            ring.append(b.add(C + eu * (math.cos(a) * r) + ew * (math.sin(a) * r) + et * t))
        rings.append(ring)
    mid = C + et * (sum(t for r, t in prof) / len(prof))
    for i in range(len(prof) - 1):
        if prof[i][0] < 1e-5 and prof[i + 1][0] < 1e-5:
            continue
        rf = Vector(ref) if ref is not None else mid
        for k in range(n):
            k2 = (k + 1) % n
            b.face_out([rings[i][k], rings[i][k2], rings[i + 1][k2], rings[i + 1][k]], mat, rf, smooth)
    if caps:
        for i, sign in ((0, -1), (len(prof) - 1, 1)):
            ref = C + et * (prof[i][1] - sign * 1.0)
            b.face_out(rings[i], mat, ref)
    return rings


def tube(b, pts, r, mat, segs=8, smooth=True, caps=False):
    pts = [Vector(p) for p in pts]
    rings = []
    prev_n1 = None
    for i, p in enumerate(pts):
        a = pts[max(0, i - 1)]
        c = pts[min(len(pts) - 1, i + 1)]
        t = (c - a).normalized()
        if prev_n1 is None:
            up = Vector((0, 1, 0)) if abs(t.y) < 0.9 else Vector((1, 0, 0))
            n1 = t.cross(up).normalized()
        else:
            n1 = (prev_n1 - t * prev_n1.dot(t)).normalized()
        prev_n1 = n1
        n2 = n1.cross(t).normalized()
        rings.append([b.add(p + (n1 * math.cos(2 * math.pi * k / segs) + n2 * math.sin(2 * math.pi * k / segs)) * r) for k in range(segs)])
    for i in range(len(rings) - 1):
        ref = (pts[i] + pts[i + 1]) / 2
        for k in range(segs):
            k2 = (k + 1) % segs
            b.face_out([rings[i][k], rings[i][k2], rings[i + 1][k2], rings[i + 1][k]], mat, ref, smooth)
    if caps:
        b.face_out(rings[0], mat, pts[1])
        b.face_out(rings[-1], mat, pts[-2])


def prism(b, prof, axis_from, axis_to, mat, smooth=False, caps=True, up=Vector((0, 1, 0))):
    """Extrude a 2D profile [(u, v)] along a segment; u is horizontal across, v along `up`."""
    A, B = Vector(axis_from), Vector(axis_to)
    t = (B - A).normalized()
    eu = up.cross(t).normalized()
    ev = t.cross(eu).normalized()
    r0 = [b.add(A + eu * u + ev * v) for u, v in prof]
    r1 = [b.add(B + eu * u + ev * v) for u, v in prof]
    n = len(prof)
    cu = sum(p[0] for p in prof) / n
    cv = sum(p[1] for p in prof) / n
    for k in range(n):
        k2 = (k + 1) % n
        mid = (A + B) / 2 + eu * cu + ev * cv
        b.face_out([r0[k], r0[k2], r1[k2], r1[k]], mat, mid, smooth)
    if caps:
        b.face_out(r0, mat, B)
        b.face_out(r1, mat, A)


# ---------- 2D shapes on surfaces ----------
def rpoly(corners, radius, n=4):
    """Polygon with filleted corners (quadratic arcs); every corner gives n + 1 points so shapes stay compatible."""
    N = len(corners)
    out = []
    for i, c in enumerate(corners):
        c = Vector(c)
        p0 = Vector(corners[i - 1])
        p2 = Vector(corners[(i + 1) % N])
        r = radius[i] if isinstance(radius, (list, tuple)) else radius
        d1, d2 = p0 - c, p2 - c
        if r <= 1e-5 or d1.length < 1e-6 or d2.length < 1e-6:
            out += [(c.x, c.y)] * (n + 1)
            continue
        l1, l2 = d1.length, d2.length
        d1.normalize()
        d2.normalize()
        ang = math.acos(max(-1.0, min(1.0, d1.dot(d2))))
        t = r / max(1e-4, math.tan(ang / 2))
        t = min(t, 0.48 * l1, 0.48 * l2)
        a = c + d1 * t
        e = c + d2 * t
        for k in range(n + 1):
            s = k / n
            p = a * (1 - s) ** 2 + c * 2 * (1 - s) * s + e * s * s
            out.append((p.x, p.y))
    return out


def rrect(u0, u1, v0, v1, r, n=4):
    return rpoly([(u0, v0), (u1, v0), (u1, v1), (u0, v1)], r, n)


def circle(u, v, r, n=16, sy=1.0):
    return [(u + math.cos(2 * math.pi * k / n) * r, v + math.sin(2 * math.pi * k / n) * r * sy) for k in range(n)]


def mirror_u(poly):
    return [(-u, v) for u, v in reversed(poly)]


def sym(half):
    """Symmetric polygon from its left half [(u >= 0, v)] listed from the bottom centre round to the top centre."""
    return half + [(-u, v) for u, v in reversed(half)]


def offset_corners(corners, d):
    """Convex polygon grown by d (shrinks for d < 0)."""
    N = len(corners)
    area = sum(corners[i][0] * corners[(i + 1) % N][1] - corners[(i + 1) % N][0] * corners[i][1] for i in range(N))
    s = 1 if area > 0 else -1
    lines = []
    for i in range(N):
        a, c = Vector(corners[i]), Vector(corners[(i + 1) % N])
        t = (c - a).normalized()
        nrm = Vector((t.y, -t.x)) * s
        lines.append((a + nrm * d, t))
    out = []
    for i in range(N):
        (p1, t1), (p2, t2) = lines[i - 1], lines[i]
        den = t1.x * t2.y - t1.y * t2.x
        if abs(den) < 1e-9:
            out.append(tuple(p2))
            continue
        k = ((p2.x - p1.x) * t2.y - (p2.y - p1.y) * t2.x) / den
        p = p1 + t1 * k
        out.append((p.x, p.y))
    return out


def u_extent(poly, v):
    xs = []
    N = len(poly)
    for i in range(N):
        (u0, v0), (u1, v1) = poly[i], poly[(i + 1) % N]
        if (v0 - v) * (v1 - v) <= 0 and abs(v1 - v0) > 1e-9:
            xs.append(u0 + (u1 - u0) * (v - v0) / (v1 - v0))
    return (min(xs), max(xs)) if len(xs) >= 2 else None


class Surf:
    """Outline levels (y, half width W, front z F, corner radius r) of a rounded body; point at (u, y) where u is
    the arc length from the front centreline round the corner toward the side (+u is the driver's side, +x)."""

    def __init__(self, levels):
        self.levels = levels

    def at(self, y):
        L = self.levels
        if y <= L[0][0]:
            return L[0][1:]
        if y >= L[-1][0]:
            return L[-1][1:]
        for i in range(len(L) - 1):
            if L[i][0] <= y <= L[i + 1][0]:
                t = (y - L[i][0]) / max(1e-9, L[i + 1][0] - L[i][0])
                return tuple(lerp(L[i][k], L[i + 1][k], t) for k in (1, 2, 3))

    def base(self, u, y):
        W, F, r = self.at(y)
        s = 1 if u >= 0 else -1
        u = abs(u)
        a = W - r
        if u <= a:
            x, z, nx, nz = u, F, 0.0, 1.0
        elif u <= a + math.pi * r / 2:
            th = (u - a) / r
            x, z, nx, nz = a + r * math.sin(th), F - r + r * math.cos(th), math.sin(th), math.cos(th)
        else:
            x, z, nx, nz = W, F - r - (u - a - math.pi * r / 2), 1.0, 0.0
        return Vector((s * x, y, z)), Vector((s * nx, 0, nz))

    def pt(self, u, y, off=0.0):
        p, n = self.base(u, y)
        if off:
            d = 0.01
            pu = self.base(u + d, y)[0] - self.base(u - d, y)[0]
            py = self.base(u, y + d)[0] - self.base(u, y - d)[0]
            nn = pu.cross(py)
            if nn.length > 1e-9:
                nn.normalize()
                if nn.dot(n) < 0:
                    nn = -nn
                n = nn
            p = p + n * off
        return p

    def a(self, y):
        W, F, r = self.at(y)
        return W - r

    def side_u(self, z, y):
        """u of a point on the side straight at depth z."""
        W, F, r = self.at(y)
        return (W - r) + math.pi * r / 2 + (F - r - z)


class Side:
    """Flat side of the cab at x = +-W(y): coordinates (z, y)."""

    def __init__(self, surf, s):
        self.surf, self.s = surf, s

    def pt(self, z, y, off=0.0):
        W, F, r = self.surf.at(y)
        return Vector((self.s * (W + off), y, z))


class Plane:
    """Any plane: point = o + eu * u + ev * v + n * off."""

    def __init__(self, o, eu, ev):
        self.o, self.eu, self.ev = Vector(o), Vector(eu).normalized(), Vector(ev).normalized()
        self.n = self.eu.cross(self.ev).normalized()

    def pt(self, u, v, off=0.0):
        return self.o + self.eu * u + self.ev * v + self.n * off


def resample(poly, step=0.03, closed=True):
    """Polygon with extra points so no edge is longer than step."""
    out = []
    N = len(poly)
    for i in range(N if closed else N - 1):
        p, q = Vector(poly[i]), Vector(poly[(i + 1) % N])
        n = max(1, math.ceil((q - p).length / step))
        for k in range(n):
            r = p.lerp(q, k / n)
            out.append((r.x, r.y))
    if not closed:
        out.append(tuple(poly[-1]))
    return out


def v_extent(poly, u):
    vs = []
    N = len(poly)
    for i in range(N):
        (u0, v0), (u1, v1) = poly[i], poly[(i + 1) % N]
        if (u0 - u) * (u1 - u) <= 0 and abs(u1 - u0) > 1e-9:
            vs.append(v0 + (v1 - v0) * (u - u0) / (u1 - u0))
    return (min(vs), max(vs)) if len(vs) >= 2 else None


def columns(mp, u0, u1, v):
    """Sample positions across a row: coarse on flat parts, dense round the corners of a curved surface."""
    us = []
    coarse = 0.12
    k0 = math.floor(u0 / coarse)
    k1 = math.ceil(u1 / coarse)
    us += [k * coarse for k in range(k0, k1 + 1)]
    if isinstance(mp, Surf):
        W, F, r = mp.at(v)
        a = W - r
        for s in (1, -1):
            n = max(2, math.ceil(math.pi * r / 2 / 0.025))
            for k in range(-1, n + 2):
                us.append(s * (a + math.pi * r / 2 * k / n))
    return sorted(u for u in us if u0 + 1e-4 < u < u1 - 1e-4)


def zipper(b, rowA, rowB, mat, ref_of, smooth, flip=False):
    """Triangulate between two rows of (u, id) sorted by u."""
    i = j = 0
    out = []
    while i < len(rowA) - 1 or j < len(rowB) - 1:
        if j >= len(rowB) - 1 or (i < len(rowA) - 1 and rowA[i + 1][0] <= rowB[j + 1][0]):
            tri = [rowA[i][1], rowA[i + 1][1], rowB[j][1]]
            i += 1
        else:
            tri = [rowA[i][1], rowB[j + 1][1], rowB[j][1]]
            j += 1
        out.append(tri)
    for tri in out:
        q = b.face_out(tri, mat, ref_of(tri), smooth)
        if flip:
            b.f[-1] = list(reversed(q))


def shape(b, mp, poly, off, mat, depth=0.0, wall=None, rings=None, back=False, smooth=False, dv=0.035):
    """Filled convex outline on a surface, tessellated in rows (dense round curved corners), optional side walls."""
    vmin = min(p[1] for p in poly)
    vmax = max(p[1] for p in poly)
    nv = max(1, math.ceil((vmax - vmin) / dv))
    layers = []
    for lay_off, flip in ((off, False), (off - 0.002, True)) if back else ((off, False),):
        rows = []
        for k in range(nv + 1):
            v = vmin + (vmax - vmin) * k / nv
            v = min(max(v, vmin + 1e-5), vmax - 1e-5)
            ex = u_extent(poly, v)
            if not ex:
                continue
            us = [ex[0]] + columns(mp, ex[0], ex[1], v) + [ex[1]]
            rows.append([(u, b.add(mp.pt(u, v, lay_off))) for u in us])
        layers.append((rows, flip))
    cu = sum(p[0] for p in poly) / len(poly)
    cv = sum(p[1] for p in poly) / len(poly)

    def ref_of(tri):
        c = sum((b.v[i] for i in tri), Vector()) / 3
        n = (mp.pt(cu, cv, off) - mp.pt(cu, cv, off - 0.1)).normalized()
        if isinstance(mp, Surf):
            # local normal from the surface at the triangle's position
            return c - surf_normal_at(mp, c) * 0.5
        return c - n * 0.5

    for rows, flip in layers:
        for ra, rb in zip(rows, rows[1:]):
            zipper(b, ra, rb, mat, ref_of, smooth, flip)
    if depth:
        bnd = resample(poly, 0.03)
        top = [b.add(mp.pt(u, v, off)) for u, v in bnd]
        low = [b.add(mp.pt(u, v, off - depth)) for u, v in bnd]
        n = len(bnd)
        for i in range(n):
            i2 = (i + 1) % n
            mid = Vector(((bnd[i][0] + bnd[i2][0]) / 2, (bnd[i][1] + bnd[i2][1]) / 2))
            inward = Vector((cu, cv)) - mid
            if inward.length > 1e-9:
                inward.normalize()
            pin = mp.pt(mid.x + inward.x * 0.02, mid.y + inward.y * 0.02, off - depth / 2)
            b.face_out([top[i], top[i2], low[i2], low[i]], wall or mat, pin, False)
    return rows


def surf_normal_at(mp, p):
    """Outward normal of a Surf near a 3D point (by its height and side)."""
    W, F, r = mp.at(p.y)
    a = W - r
    ax = abs(p.x)
    s = 1 if p.x >= 0 else -1
    if ax <= a:
        n = Vector((0, 0, 1))
    elif p.z > F - r:
        d = Vector((ax - a, 0, p.z - (F - r)))
        n = d.normalized() if d.length > 1e-6 else Vector((0, 0, 1))
        n.x *= s
    else:
        n = Vector((s, 0, 0))
    return n


def subdiv_pair(A, B, step=0.04):
    """Two closed outlines with matching points, subdivided together so no segment exceeds step."""
    oa, ob = [], []
    N = len(A)
    for i in range(N):
        a0, a1 = Vector(A[i]), Vector(A[(i + 1) % N])
        b0, b1 = Vector(B[i]), Vector(B[(i + 1) % N])
        n = max(1, math.ceil(max((a1 - a0).length, (b1 - b0).length) / step))
        for k in range(n):
            pa, pb = a0.lerp(a1, k / n), b0.lerp(b1, k / n)
            oa.append((pa.x, pa.y))
            ob.append((pb.x, pb.y))
    return oa, ob


def frame(b, mp, outer, inner, off, mat, depth=0.0, back=False, wall=None, inner_depth=0.0, step=0.04):
    assert len(outer) == len(inner), (len(outer), len(inner))
    outer, inner = subdiv_pair(outer, inner, step)
    n = len(outer)
    O = [b.add(mp.pt(u, v, off)) for u, v in outer]
    I = [b.add(mp.pt(u, v, off)) for u, v in inner]
    if back:
        Ob = [b.add(mp.pt(u, v, off - 0.002)) for u, v in outer]
        Ib = [b.add(mp.pt(u, v, off - 0.002)) for u, v in inner]

    def inside(i):
        c = (b.v[O[i]] + b.v[I[i]]) / 2
        if isinstance(mp, Surf):
            return c - surf_normal_at(mp, c) * 0.5
        return c - (mp.pt(0, 0, 1) - mp.pt(0, 0, 0)) * 0.5

    for i in range(n):
        i2 = (i + 1) % n
        b.face_out([O[i], O[i2], I[i2], I[i]], mat, inside(i))
        if back:
            q = b.face_out([Ob[i], Ob[i2], Ib[i2], Ib[i]], mat, inside(i))
            b.f[-1] = list(reversed(q))
    if depth:
        lo = [b.add(mp.pt(u, v, off - depth)) for u, v in outer]
        for i in range(n):
            i2 = (i + 1) % n
            mid_in = (b.v[I[i]] + b.v[I[i2]]) / 2
            b.face_out([O[i], O[i2], lo[i2], lo[i]], wall or mat, mid_in)
    if inner_depth:
        li = [b.add(mp.pt(u, v, off - inner_depth)) for u, v in inner]
        for i in range(n):
            i2 = (i + 1) % n
            far = (b.v[O[i]] + b.v[O[i2]]) / 2
            b.face_out([I[i], I[i2], li[i2], li[i]], wall or mat, far)


def strip(b, mp, pts, width, off, mat, depth=0.0, back=False):
    """Band of the given width along a polyline in surface coordinates."""
    pts = resample(pts, 0.04, closed=False)
    L, R = [], []
    n = len(pts)
    for i in range(n):
        a = Vector(pts[max(0, i - 1)])
        c = Vector(pts[min(n - 1, i + 1)])
        t = (c - a).normalized()
        nrm = Vector((-t.y, t.x)) * (width / 2)
        p = Vector(pts[i])
        L.append((p.x + nrm.x, p.y + nrm.y))
        R.append((p.x - nrm.x, p.y - nrm.y))
    Li = [b.add(mp.pt(u, v, off)) for u, v in L]
    Ri = [b.add(mp.pt(u, v, off)) for u, v in R]
    if back:
        Lb = [b.add(mp.pt(u, v, off - 0.002)) for u, v in L]
        Rb = [b.add(mp.pt(u, v, off - 0.002)) for u, v in R]

    def inside(i):
        c = b.v[Li[i]]
        if isinstance(mp, Surf):
            return c - surf_normal_at(mp, c) * 0.5
        return c - (mp.pt(0, 0, 1) - mp.pt(0, 0, 0)) * 0.5

    for i in range(n - 1):
        b.face_out([Li[i], Li[i + 1], Ri[i + 1], Ri[i]], mat, inside(i))
        if back:
            q = b.face_out([Lb[i], Lb[i + 1], Rb[i + 1], Rb[i]], mat, inside(i))
            b.f[-1] = list(reversed(q))
    if depth:
        Ll = [b.add(mp.pt(u, v, off - depth)) for u, v in L]
        Rl = [b.add(mp.pt(u, v, off - depth)) for u, v in R]
        for i in range(n - 1):
            b.face_out([Li[i], Li[i + 1], Ll[i + 1], Ll[i]], mat, (b.v[Ri[i]] + b.v[Ri[i + 1]]) / 2)
            b.face_out([Ri[i], Ri[i + 1], Rl[i + 1], Rl[i]], mat, (b.v[Li[i]] + b.v[Li[i + 1]]) / 2)
        for i, j in ((0, 1), (n - 1, n - 2)):
            b.face_out([Li[i], Ri[i], Rl[i], Ll[i]], mat, (b.v[Li[j]] + b.v[Ri[j]]) / 2)


# ---------- text (fictional names, plates) ----------
FONT = None


def text_on(b, mp, text, cu, cv, height, off, mat, depth=0.01, spacing=1.0, bold=True):
    """Letters mapped onto a surface: text x along u, y along v, extruded along the surface normal."""
    global FONT
    path = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf' if bold else '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'
    if FONT is None or FONT.get(path) is None:
        FONT = FONT or {}
        FONT[path] = bpy.data.fonts.load(path) if os.path.exists(path) else None
    cu_ = bpy.data.curves.new('t', 'FONT')
    cu_.body = text
    if FONT[path]:
        cu_.font = FONT[path]
    cu_.size = height
    cu_.resolution_u = 2
    cu_.extrude = depth / 2 if depth > 0.004 else 0.0
    cu_.space_character = spacing
    cu_.align_x = 'CENTER'
    cu_.align_y = 'CENTER'
    o = bpy.data.objects.new('t', cu_)
    bpy.context.scene.collection.objects.link(o)
    dg = bpy.context.evaluated_depsgraph_get()
    me = bpy.data.meshes.new_from_object(o.evaluated_get(dg))
    bpy.data.objects.remove(o)
    base = len(b.v)
    for v in me.vertices:
        b.add(mp.pt(cu + v.co.x, cv + v.co.y, off + v.co.z + depth / 2))
    for p in me.polygons:
        b.face([base + i for i in p.vertices], mat)
    bpy.data.meshes.remove(me)


# ---------- wheels ----------
def tyre_and_rim(b, R, W, rim_r, centre, side, style='alu', segs=32, dual=False, inner=False):
    """One wheel around the x axis; the outer face toward side * x."""
    cx, cy, cz = centre
    C = Vector(centre)
    sw = 0.06  # sidewall bulge
    prof = [(rim_r + 0.005, -W / 2 + 0.02), (rim_r + 0.03, -W / 2 + 0.005), (R - 0.09, -W / 2 - 0.005), (R - 0.03, -W / 2 + 0.02),
            (R - 0.006, -W / 2 + 0.05), (R, -W / 2 + 0.08), (R, W / 2 - 0.08), (R - 0.006, W / 2 - 0.05), (R - 0.03, W / 2 - 0.02),
            (R - 0.09, W / 2 + 0.005), (rim_r + 0.03, W / 2 - 0.005), (rim_r + 0.005, W / 2 - 0.02)]
    prof = [(r, side * t) for r, t in prof]
    lathe(b, centre, 'x', prof, segs, 'tyre', True)
    # tread: circumferential grooves and shoulder blocks
    for t in (-0.32, -0.1, 0.1, 0.32):
        lathe(b, (cx + side * t * W, cy, cz), 'x', [(R + 0.002, -0.006), (R + 0.002, 0.006)], segs, 'rimdark', True)
    if inner:
        lathe(b, centre, 'x', [(rim_r, -side * (W / 2 - 0.03)), (0.0, -side * (W / 2 - 0.08))], 20, 'rimdark', False, ref=C + Vector((side, 0, 0)))
        lathe(b, centre, 'x', [(rim_r, side * (W / 2 - 0.03)), (0.0, side * (W / 2 - 0.08))], 20, 'rimdark', False, ref=C - Vector((side, 0, 0)))
        return
    xo = side * (W / 2 - 0.015)
    dish = 0.1 if dual else 0.06
    mat = 'rim' if style == 'alu' else 'steel'
    face = [(rim_r + 0.01, xo + side * 0.004), (rim_r, xo), (rim_r * 0.94, xo - side * 0.015), (rim_r * 0.8, xo - side * dish * 0.5),
            (rim_r * 0.6, xo - side * dish), (rim_r * 0.42, xo - side * dish), (rim_r * 0.36, xo - side * dish + side * 0.02),
            (rim_r * 0.2, xo - side * dish + side * 0.03), (0.06, xo - side * dish + side * 0.05), (0.0, xo - side * dish + side * 0.06)]
    behind = C - Vector((side * 1.0, 0, 0))
    lathe(b, centre, 'x', face, segs, mat, True, ref=behind)
    # hand holes
    n_holes = 10 if style == 'alu' else 8
    for k in range(n_holes):
        a = 2 * math.pi * (k + 0.5) / n_holes
        r = rim_r * 0.7
        P = Vector((cx + xo - side * dish * 0.72 + side * 0.004, cy + math.cos(a) * r, cz + math.sin(a) * r))
        t = Vector((0, -math.sin(a), math.cos(a)))
        rad = Vector((0, math.cos(a), math.sin(a)))
        hw = 0.075 if style == 'alu' else 0.05
        hh = 0.07 if style == 'alu' else 0.045
        ring = []
        for kk in range(10):
            aa = 2 * math.pi * kk / 10
            ring.append(b.add(P + t * math.cos(aa) * hw / 2 + rad * math.sin(aa) * hh / 2))
        b.face_out(ring, 'rimdark', (cx - side * 1.0, cy, cz))
    # wheel nuts with a chrome ring
    hub_x = cx + xo - side * dish + side * 0.03
    lathe(b, (hub_x, cy, cz), 'x', [(rim_r * 0.33, 0.0), (rim_r * 0.33, side * 0.008), (rim_r * 0.15, side * 0.012)], 24, 'chrome' if style == 'alu' else 'steel', True, ref=behind)
    for k in range(10):
        a = 2 * math.pi * k / 10
        r = rim_r * 0.255
        lathe(b, (hub_x, cy + math.cos(a) * r, cz + math.sin(a) * r), 'x', [(0.017, 0), (0.017, side * 0.03), (0.0, side * 0.034)], 6, 'chrome', True,
              ref=Vector((hub_x - side * 0.2, cy + math.cos(a) * r, cz + math.sin(a) * r)))
    lathe(b, (hub_x, cy, cz), 'x', [(0.075, 0), (0.07, side * 0.05), (0.0, side * 0.06)], 16, 'chrome' if style == 'alu' else 'steel', True, ref=behind)
    lathe(b, centre, 'x', [(rim_r, -side * (W / 2 - 0.02)), (0.0, -side * (W / 2 - 0.06))], 20, 'rimdark', False, ref=C + Vector((side, 0, 0)))


def wheel_obj(name, R, W, rim_r, side, style, dual=False):
    b = Buf()
    if dual:
        gap = 0.03
        tyre_and_rim(b, R, W, rim_r, (side * (W / 2 + gap / 2), 0, 0), side, style, 32, True)
        tyre_and_rim(b, R, W, rim_r, (-side * (W / 2 + gap / 2), 0, 0), side, style, 24, True, inner=True)
    else:
        tyre_and_rim(b, R, W, rim_r, (0, 0, 0), side, style, 32)
    return b.obj(name, sharp=0.9)


# ---------- cab shell ----------
def cab_levels(S, inner=0.0):
    """Ring levels (y, half width, front z, front corner radius) from the bottom of the face to the roof."""
    fh, top, zf, w, rf = S['fh'], S['top'], S['zf'], S['w'], S['rf']
    ws0, ws1, rake = S['ws0'], S['ws1'], S['rake']
    rr, rbk = S['roofR'], S['roofBack']
    lean = S['lean']
    tum = S['tumble']
    yfb = S['yfb']
    slope = rake / max(0.1, ws1 - ws0)
    ytop0 = top - rr
    ys = [yfb, yfb + 0.03, S['yb'], (S['yb'] + ws0) / 2, ws0 - 0.1, ws0, S['wy0f'], S['wy0'], (ws0 + ws1) / 2, S['wy1'], ws1, ytop0]
    ys = sorted(set(round(y, 4) for y in ys if y <= ytop0 + 1e-6))
    levels = []
    for y in ys:
        if y <= ws0:
            k = (y - yfb) / max(1e-3, ws0 - yfb)
            front = zf - lean * k
            ww = w - (0.035 if y < yfb + 0.02 else 0.0)
            r = rf
        else:
            k = min(1.0, (y - ws0) / max(1e-3, ws1 - ws0))
            front = zf - lean - slope * (y - ws0)
            ww = w - tum * k
            r = rf + 0.02 * k
        levels.append((y, ww, front, r))
    # roof shoulder: quarter circles at the sides and the front
    y0, w0, f0, r0 = levels[-1]
    for k in range(1, 6):
        a = math.pi / 2 * k / 5
        y = ytop0 + rr * math.sin(a)
        dw = rr * (1 - math.cos(a))
        df = rbk * (1 - math.cos(a))
        levels.append((y, w0 - dw, f0 - df - slope * (y - ytop0) * 0.3, r0 + dw * 0.8))
    if inner:
        levels = [(y, w_ - inner, f - inner, max(0.03, r - inner * 0.6)) for (y, w_, f, r) in levels if S['fh'] - 0.05 <= y <= top - inner]
        levels.append((top - inner, levels[-1][1] - 0.02, levels[-1][2] - 0.02, levels[-1][3]))
    return levels


def rr_points(w, zf, zr, rf, rb, xs_front, zs_side, nc=6):
    half = []
    for x in xs_front:
        half.append((min(x, w - rf - 1e-3), zf))
    for k in range(1, nc):
        a = math.pi / 2 * (1 - k / nc)
        half.append((w - rf + math.cos(a) * rf, zf - rf + math.sin(a) * rf))
    for z in zs_side:
        half.append((w, max(min(z, zf - rf - 1e-3), zr + rb + 1e-3)))
    for k in range(0, nc + 1):
        a = -math.pi / 2 * k / nc
        half.append((w - rb + math.cos(a) * rb, zr + rb + math.sin(a) * rb))
    half.append((0.0, zr))
    full = [(x, z) for x, z in half]
    full += [(-x, z) for x, z in reversed(half[1:-1])]
    return full, len(xs_front), nc - 1, len(zs_side)


def cab_shell(S, inner=0.0):
    b = Buf()
    levels = cab_levels(S, inner)
    zr = S['zr'] + inner
    rb = S['rb']
    xw = S['xw'] - inner * 0.3
    xs_front = [0.0, xw * 0.25, xw * 0.5, xw * 0.75, xw, xw + 0.04]
    zs_side = sorted(set([S['wz0'], S['wz1'], (S['wz0'] + S['wz1']) / 2, S['wz0'] + 0.05, S['wz1'] - 0.05,
                          lerp(S['wz1'], S['zr'], 0.5), S['zr'] + 0.2, S['wb'] + 0.75, S['wb'] + 0.4, S['wb'], S['wb'] - 0.4]), reverse=True)
    rings = []
    meta = None
    for (y, w, front, r) in levels:
        pts, nfs, ncorner, nside = rr_points(w, front, zr, r, rb, xs_front, zs_side)
        meta = (nfs, ncorner, nside)
        rings.append([b.add((x, y, z)) for x, z in pts])
    n = len(rings[0])
    nfs, ncorner, nside = meta
    half = n // 2 + 1

    def kind(j):
        jj = j if j < half else n - j
        if jj <= nfs - 1:
            return 'front'
        if jj < nfs + ncorner:
            return 'corner'
        if jj < nfs + ncorner + nside:
            return 'side'
        return 'rear'

    for i in range(len(rings) - 1):
        y0, y1 = levels[i][0], levels[i + 1][0]
        ym = (y0 + y1) / 2
        for j in range(n):
            j2 = (j + 1) % n
            p0, p1 = b.v[rings[i][j]], b.v[rings[i][j2]]
            mx = (p0.x + p1.x) / 2
            mz = (p0.z + p1.z) / 2
            k0, k1 = kind(j), kind(j2)
            glass = False
            if k0 == 'front' and k1 == 'front' and S['ws0'] <= ym <= S['ws1'] and abs(mx) < xw + 1e-3:
                glass = True
            if k0 == 'side' and k1 == 'side' and S['wy0f'] <= ym <= S['wy1'] and S['wz1'] - 1e-3 <= mz <= S['wz0'] + 1e-3:
                glass = True
            ref = (0, ym, (S['zf'] + S['zr']) / 2)
            q = [rings[i][j], rings[i][j2], rings[i + 1][j2], rings[i + 1][j]]
            if inner:
                if glass:
                    continue
                mat = 'headliner' if ym > S['wy1'] - 0.02 else 'panel'
                pp = [b.v[k] for k in q]
                nrm = (pp[1] - pp[0]).cross(pp[3] - pp[0])
                if nrm.length < 1e-9:
                    nrm = (pp[2] - pp[1]).cross(pp[3] - pp[1])
                c = sum(pp, Vector()) / 4
                b.face(q if nrm.dot(Vector(ref) - c) >= 0 else list(reversed(q)), mat, True)
            else:
                b.face_out(q, 'glass' if glass else 'paint', ref, False)
    topring = rings[-1]
    c = b.add((0, levels[-1][0] + (0.0 if inner else 0.025), (levels[-1][2] + zr) / 2))
    for j in range(n):
        j2 = (j + 1) % n
        if inner:
            q = [c, topring[j], topring[j2]]
            pp = [b.v[k] for k in q]
            nrm = (pp[1] - pp[0]).cross(pp[2] - pp[0])
            b.face(q if nrm.y < 0 else list(reversed(q)), 'headliner', True)
        else:
            b.face_out([c, topring[j], topring[j2]], 'paint', (0, levels[-1][0] - 1, (S['zf'] + zr) / 2), True)
    if not inner:
        bot = rings[0]
        cb = b.add((0, levels[0][0], (levels[0][2] + zr) / 2))
        for j in range(n):
            b.face_out([cb, bot[j], bot[(j + 1) % n]], 'trim', (0, levels[0][0] + 1, (S['zf'] + zr) / 2))
    return b


def boolean_cut(o, cutter_buf):
    co = cutter_buf.obj('cut', sharp=0)
    bo = o.modifiers.new('cut', 'BOOLEAN')
    bo.operation = 'DIFFERENCE'
    bo.solver = 'EXACT'
    bo.object = co
    bo.material_mode = 'TRANSFER'
    dg = bpy.context.evaluated_depsgraph_get()
    me = bpy.data.meshes.new_from_object(o.evaluated_get(dg))
    o.modifiers.clear()
    old = o.data
    o.data = me
    bpy.data.meshes.remove(old)
    bpy.data.objects.remove(co)
    names = [m.name[4:] if m else 'paint' for m in me.materials]
    if names != MLIST:
        idx = [MLIST.index(nm) if nm in MDEF else 0 for nm in names]
        for p in me.polygons:
            p.material_index = idx[p.material_index] if p.material_index < len(idx) else 0
        me.materials.clear()
        for nm in MLIST:
            me.materials.append(MATS[nm])


def arch_cutter(S):
    c = Buf()
    Ra = S['R'] + 0.13
    lathe(c, (0, S['R'], S['wb']), 'x', [(0.0, -2), (Ra, -2), (Ra, 2), (0.0, 2)], 36, 'trim', False)
    return c, Ra


# ---------- the lineup's faces ----------
def lamp_unit(b, mp, s, housing, cfg, off=0.012):
    """Headlamp: dark housing, chrome reflectors, projector lenses, daytime light signature, indicator."""
    M = (lambda poly: [(s * u, v) for u, v in poly])
    shape(b, mp, M(housing), off, cfg.get('bezel', 'trim'), depth=0.035, wall='trim')
    inner = cfg.get('inner')
    if inner:
        shape(b, mp, M(inner), off + 0.004, 'darkchrome')
    for (u, v, r) in cfg.get('proj', ()):
        shape(b, mp, M(circle(u, v, r * 1.25, 20)), off + 0.006, 'chrome', depth=0.004)
        shape(b, mp, M(circle(u, v, r, 20)), off + 0.011, 'head', depth=0.004, wall='darkchrome')
    for (u0, u1, v0, v1) in cfg.get('reflectors', ()):
        shape(b, mp, M(rrect(u0, u1, v0, v1, 0.02)), off + 0.007, 'head', depth=0.003, wall='chrome')
    for line in cfg.get('drl', ()):
        strip(b, mp, M(line), cfg.get('drlW', 0.018), off + 0.014, 'drl', depth=0.006)
    ind = cfg.get('ind')
    if ind:
        shape(b, mp, M(ind), off + 0.008, 'ind_L' if s > 0 else 'ind_R')
    # clear cover over the whole lamp
    shape(b, mp, M(housing), off + 0.022, 'lens')


def grille_unit(b, mp, corners, r, g):
    """Grille: dark backing, mesh, bars clipped to the outline, optional surround."""
    poly = rpoly(corners, r, 4)
    off = g.get('off', 0.006)
    shape(b, mp, poly, off, g.get('back', 'grille'), depth=0.03)
    mesh = g.get('mesh')
    v0 = min(p[1] for p in corners)
    v1 = max(p[1] for p in corners)
    if mesh:
        kind, step = mesh
        v = v0 + step / 2
        while v < v1 - step / 3:
            ex = u_extent(poly, v)
            if ex:
                shape(b, mp, rrect(ex[0] + 0.02, ex[1] - 0.02, v - 0.004, v + 0.004, 0.0, 1), off + 0.004, 'steel' if kind != 'honey' else 'grille')
            v += step
        if kind in ('grid', 'honey'):
            u0 = min(p[0] for p in corners)
            u1 = max(p[0] for p in corners)
            u = u0 + step / 2
            while u < u1:
                ve = v_extent(poly, u)
                if ve and ve[1] - ve[0] > 0.05:
                    shape(b, mp, rrect(u - 0.004, u + 0.004, ve[0] + 0.02, ve[1] - 0.02, 0.0, 1), off + 0.005, 'steel')
                u += step
    for bar in g.get('bars', ()):
        bv0, bv1, mat = bar[:3]
        inset = bar[3] if len(bar) > 3 else 0.03
        gap = bar[4] if len(bar) > 4 else 0.0
        ex0 = u_extent(poly, bv0 + 0.003)
        ex1 = u_extent(poly, bv1 - 0.003)
        if not ex0 or not ex1:
            continue
        ul0, ur0 = ex0[0] + inset, ex0[1] - inset
        ul1, ur1 = ex1[0] + inset, ex1[1] - inset
        rad = min(0.03, (bv1 - bv0) * 0.45)
        if gap:
            for side in (-1, 1):
                pts = [(gap / 2, bv0), (ur0, bv0), (ur1, bv1), (gap / 2, bv1)] if side > 0 else [(ul0, bv0), (-gap / 2, bv0), (-gap / 2, bv1), (ul1, bv1)]
                shape(b, mp, rpoly(pts, [0.005, rad, rad, 0.005], 3), off + g.get('barH', 0.02), mat, depth=g.get('barH', 0.02) + 0.01)
        else:
            shape(b, mp, rpoly([(ul0, bv0), (ur0, bv0), (ur1, bv1), (ul1, bv1)], rad, 3), off + g.get('barH', 0.02), mat, depth=g.get('barH', 0.02) + 0.01)
    for vb in g.get('vbars', ()):
        n, mat, wfrac = vb
        u0 = min(p[0] for p in corners)
        u1 = max(p[0] for p in corners)
        for i in range(n):
            u = u0 + (u1 - u0) * (i + 0.5) / n
            w_ = (u1 - u0) / n * wfrac
            ve0, ve1 = v_extent(poly, u - w_ / 2), v_extent(poly, u + w_ / 2)
            if not ve0 or not ve1:
                continue
            lo, hi = max(ve0[0], ve1[0]) + 0.03, min(ve0[1], ve1[1]) - 0.03
            if hi - lo < 0.05:
                continue
            shape(b, mp, rrect(u - w_ / 2, u + w_ / 2, lo, hi, w_ * 0.4, 2), off + g.get('barH', 0.02), mat, depth=g.get('barH', 0.02) + 0.01)
    sur = g.get('surround')
    if sur:
        width, mat, h = sur
        outer = rpoly(offset_corners(corners, width), r + width * 0.8, 4)
        frame(b, mp, outer, poly, off + h, mat, depth=h + 0.02, inner_depth=h + 0.01)
    return poly


def standard_face(b, S, F, BM):
    """Front of a modern European cab-over: grille, lamps in the lower corners, badge, lower intake."""
    st = S['style']
    a = F.a(1.2)
    g = st['grille']
    # main grille
    gc = g['corners']  # half outline from the bottom centre round to the top centre
    corners = sym(gc)
    gpoly = grille_unit(b, F, corners, g.get('r', 0.05), g)
    # lower grille between the lamps
    lw = st.get('lower')
    if lw:
        lc = sym(lw['corners'])
        grille_unit(b, F, lc, lw.get('r', 0.03), lw)
    # upper panel (Scania-style band under the windscreen)
    up = st.get('upper')
    if up:
        u0, v0, v1, mat = up['u'], up['v0'], up['v1'], up.get('mat', 'paint')
        shape(b, F, rrect(-u0, u0, v0, v1, 0.04), 0.012, mat, depth=0.02)
        if up.get('slot'):
            sv0, sv1 = up['slot']
            shape(b, F, rrect(-u0 + 0.12, u0 - 0.12, sv0, sv1, 0.02), 0.016, 'grille', depth=0.01)
    # badge (fictional name)
    bd = st.get('badge')
    if bd:
        text_on(b, F, S['badge'], 0.0, bd['v'], bd['size'], bd.get('off', 0.03), bd.get('mat', 'badge'), depth=0.012, spacing=bd.get('spacing', 1.0))
        if bd.get('plate'):
            pw, ph = bd['plate']
            shape(b, F, rrect(-pw, pw, bd['v'] - ph, bd['v'] + ph, ph * 0.9), bd.get('off', 0.03) - 0.008, bd.get('plateMat', 'darkchrome'), depth=0.02)
    # headlamps
    L = st['lamps']
    for s in (1, -1):
        lamp_unit(b, BM if L.get('onBumper') else F, s, L['housing'], L)
    # fog lamps, plate, steps and the lower spoiler on the bumper
    bumper_details(b, S, BM)
    # cab-face extras: wipers, washer jets, step plate in the grille
    for k in (-0.55, 0.45):
        tube(b, [F.pt(k + 0.32, S['ws0'] + 0.03, 0.03), F.pt(k - 0.32, S['ws0'] + 0.38, 0.03)], 0.009, 'trim', 5)
        box(b, tuple(F.pt(k + 0.32, S['ws0'] + 0.02, 0.025)), (0.06, 0.04, 0.04), 'trim')
    for extra in st.get('extras', ()):
        extra(b, S, F, BM)


def bumper_details(b, S, BM):
    st = S['style']
    bp = st.get('bumper', {})
    yb0, yb1 = S['bumperY']
    aB = BM.a(0.6)
    # dark lower part / spoiler
    lowv = bp.get('lowV', yb0 + 0.18)
    shape(b, BM, rrect(-aB - 0.35, aB + 0.35, yb0 + 0.015, lowv, 0.0, 1), 0.006, bp.get('lowMat', 'plastic'), depth=0.01)
    # central air intake and the number plate (Russian format, generic text)
    iv0, iv1 = bp.get('intake', (lowv + 0.03, lowv + 0.14))
    iu = bp.get('intakeU', 0.62)
    shape(b, BM, rrect(-iu, iu, iv0, iv1, 0.03), 0.01, 'grille', depth=0.015)
    for k in range(2):
        v = iv0 + (iv1 - iv0) * (k + 1) / 3
        shape(b, BM, rrect(-iu + 0.03, iu - 0.03, v - 0.006, v + 0.006, 0.0, 1), 0.014, 'plastic')
    pv = bp.get('plateV', iv1 + 0.1)
    shape(b, BM, rrect(-0.27, 0.27, pv - 0.06, pv + 0.06, 0.01), 0.02, 'trim', depth=0.015)
    shape(b, BM, rrect(-0.26, 0.26, pv - 0.056, pv + 0.056, 0.008), 0.024, 'plate')
    text_on(b, BM, S.get('plate', 'Т 777 ДР 16'), 0.0, pv - 0.004, 0.072, 0.024, 'ink', depth=0.003, spacing=1.05)
    # fog lamps
    fu = bp.get('fogU', aB - 0.12)
    fv = bp.get('fogV', lowv + 0.09)
    fr = bp.get('fogR', 0.055)
    for s in (1, -1):
        if bp.get('fogRect'):
            fw, fh_ = bp['fogRect']
            shape(b, BM, rrect(s * fu - fw, s * fu + fw, fv - fh_, fv + fh_, 0.02), 0.012, 'trim', depth=0.02)
            shape(b, BM, rrect(s * fu - fw + 0.012, s * fu + fw - 0.012, fv - fh_ + 0.012, fv + fh_ - 0.012, 0.015), 0.018, 'head', depth=0.005)
        else:
            shape(b, BM, circle(s * fu, fv, fr + 0.018, 20), 0.012, 'trim', depth=0.02)
            shape(b, BM, circle(s * fu, fv, fr, 20), 0.018, 'head', depth=0.005)
        # tow eye cover
        shape(b, BM, rrect(s * 0.78 - 0.05, s * 0.78 + 0.05, lowv - 0.05, lowv + 0.0, 0.015), 0.012, 'plastic', depth=0.01)
    # cleaning step in the middle of some bumpers
    if bp.get('step'):
        shape(b, BM, rrect(-0.22, 0.22, yb1 - 0.12, yb1 - 0.04, 0.02), 0.02, 'alu', depth=0.02)


def steps_and_fenders(b, S, F):
    """Boarding steps in front of the front wheel, plastic arch liner and mud flap."""
    R, wb, w = S['R'], S['wb'], S['w']
    Ra = R + 0.13
    zs0 = wb + Ra + 0.04
    zs1 = S['dw0'] - 0.02
    for s in (1, -1):
        sd = Side(F, s)
        # recessed step well: dark panel on the cab side with alu treads
        shape(b, sd, rrect(zs1, zs0, S['yfb'] - 0.02, S['fh'] - 0.04, 0.03), 0.006, 'plastic', depth=0.02)
        for y in (S['yfb'] + 0.02, (S['yfb'] + S['fh']) / 2 + 0.04):
            box(b, (s * (w - 0.08), y, (zs0 + zs1) / 2), (0.26, 0.03, zs1 - zs0 - 0.04), 'alu')
            box(b, (s * (w - 0.08), y - 0.05, (zs0 + zs1) / 2), (0.25, 0.08, zs1 - zs0 - 0.06), 'trim')
        y = S['bumperY'][0] + 0.17
        box(b, (s * (w - 0.1), y, (zs0 + zs1) / 2), (0.28, 0.03, zs1 - zs0 - 0.04), 'alu')
        box(b, (s * (w - 0.1), y - 0.05, (zs0 + zs1) / 2), (0.27, 0.08, zs1 - zs0 - 0.06), 'trim')
        # grab handle on the A pillar
        z_h = S['zf'] - S['rf'] - 0.06
        tube(b, [(s * (w + 0.01), S['fh'] + 0.25, z_h + 0.01), (s * (w + 0.05), S['fh'] + 0.3, z_h), (s * (w + 0.05), S['fh'] + 1.0, z_h), (s * (w + 0.01), S['fh'] + 1.05, z_h + 0.01)], 0.016, 'trim', 6)
        # arch liner: a plastic band round the top of the wheel with an outer lip
        pts = []
        for k in range(0, 21):
            a = math.radians(-12 + 204 * k / 20)
            pts.append((wb + math.cos(a) * Ra, R + math.sin(a) * Ra))
        xo = s * (w + 0.005)
        xi = s * (w - 0.5)
        for (z0, y0), (z1, y1) in zip(pts, pts[1:]):
            ids = [b.add((xo, y0, z0)), b.add((xo, y1, z1)), b.add((xi, y1, z1)), b.add((xi, y0, z0))]
            b.face_out(ids, 'plastic', (s * (w - 0.25), R, wb))
            # lip
            d0 = Vector((0, y0 - R, z0 - wb)).normalized() * 0.05
            d1 = Vector((0, y1 - R, z1 - wb)).normalized() * 0.05
            ids = [b.add((xo + s * 0.03, y0 + d0.y, z0 + d0.z)), b.add((xo + s * 0.03, y1 + d1.y, z1 + d1.z)), b.add((xo + s * 0.03, y1 - d1.y * 0.3, z1 - d1.z * 0.3)), b.add((xo + s * 0.03, y0 - d0.y * 0.3, z0 - d0.z * 0.3))]
            b.face_out(ids, 'plastic', (0, R, wb))
            ids2 = [b.add((xo + s * 0.03, y0 + d0.y, z0 + d0.z)), b.add((xo + s * 0.03, y1 + d1.y, z1 + d1.z)), b.add((xo - s * 0.01, y1 + d1.y, z1 + d1.z)), b.add((xo - s * 0.01, y0 + d0.y, z0 + d0.z))]
            b.face_out(ids2, 'plastic', (s * w, R, wb))
        # mud flap behind the front wheel
        box(b, (s * (w - 0.25), 0.62, wb - Ra + 0.02), (0.46, 0.62, 0.015), 'rubber')


def cab_side(b, S, F):
    """Door and window frames, seams, handles, side lamps, air intake and the rear extenders."""
    w = S['w']
    st = S['style']
    for s in (1, -1):
        sd = Side(F, s)
        # side window: the glass hole is a rectangle; the painted skin outside the window shape and a rubber frame
        z0, z1 = S['wz0'], S['wz1']
        y0f, y0, y1 = S['wy0f'], S['wy0'], S['wy1']
        slant = st.get('aSlant', 0.1)
        hole = [(z1 - 0.025, y0f - 0.025), (z0 + 0.025, y0f - 0.025), (z0 + 0.025, y1 + 0.025), (z1 - 0.025, y1 + 0.025)]
        win = [(z1, y0), (z0 - 0.02, y0f), (z0 - slant, y1), (z1, y1)]
        r = [0.04, 0.05, 0.06, 0.05]
        frame(b, sd, rpoly(hole, 0.0, 4), rpoly(win, r, 4), 0.004, 'paint', back=True)
        inner = rpoly(offset_corners(win, -0.025), [max(0.0, x - 0.02) for x in r], 4)
        frame(b, sd, rpoly(win, r, 4), inner, 0.007, 'rubber', back=True, depth=0.006)
        # door seams
        dy0 = S['yfb'] + 0.12
        dy1 = S['ws1'] + 0.06
        for z in (S['dw0'], S['dw1']):
            strip(b, sd, [(z, dy0), (z, dy1)], 0.008, 0.003, 'seam')
        strip(b, sd, [(S['dw0'], dy0), (S['dw1'], dy0)], 0.008, 0.003, 'seam')
        strip(b, sd, [(S['dw0'] - 0.02, dy1), (S['dw1'], dy1)], 0.008, 0.003, 'seam')
        # handle in a dark pocket
        hz, hy = S['dw1'] + 0.24, S['wy0'] - 0.12
        shape(b, sd, rrect(hz - 0.12, hz + 0.12, hy - 0.035, hy + 0.035, 0.03), 0.004, 'trim')
        shape(b, sd, rrect(hz - 0.1, hz + 0.1, hy - 0.016, hy + 0.016, 0.014), 0.018, st.get('handleMat', 'chrome'), depth=0.016)
        shape(b, sd, rrect(hz + 0.06, hz + 0.09, hy - 0.01, hy + 0.01, 0.005), 0.026, 'trim')
        # side repeater and marker lamps along the cab and the chassis
        shape(b, sd, rrect(S['zf'] - S['rf'] - 0.2, S['zf'] - S['rf'] - 0.06, S['fh'] - 0.12, S['fh'] - 0.07, 0.02), 0.01, 'ind_L' if s > 0 else 'ind_R', depth=0.01)
        # locker hatch behind the door
        lz0, lz1 = S['dw1'] - 0.08, S['zr'] + 0.12
        if lz0 - lz1 > 0.4:
            ly0, ly1 = S['fh'] - 0.12, S['fh'] + 0.45
            for (pa, pb) in (((lz0, ly0), (lz0, ly1)), ((lz1, ly0), (lz1, ly1)), ((lz0, ly0), (lz1, ly0)), ((lz0, ly1), (lz1, ly1))):
                strip(b, sd, [pa, pb], 0.007, 0.003, 'seam')
            shape(b, sd, rrect(lz0 - 0.16, lz0 - 0.06, ly1 - 0.12, ly1 - 0.06, 0.015), 0.008, 'trim')
        # air intake behind the door, high up (some cabs)
        if st.get('sideIntake'):
            iz0, iz1 = S['dw1'] - 0.06, S['zr'] + 0.12
            iy0, iy1 = S['wy0'] - 0.1, S['ws1'] - 0.05
            shape(b, sd, rrect(iz1, iz0, iy0, iy1, 0.05), 0.008, 'grille', depth=0.02)
            for k in range(6):
                v = iy0 + (iy1 - iy0) * (k + 0.5) / 6
                shape(b, sd, rrect(iz1 + 0.02, iz0 - 0.02, v - 0.012, v + 0.012, 0.005), 0.016, st.get('intakeBar', 'paint2'))
        # model plate on the door
        if st.get('doorText'):
            sdm = Plane((s * (w + 0.002), 0, 0), (0, 0, -s), (0, 1, 0))
            text_on(b, sdm, st['doorText'], -s * (S['dw0'] - 0.32), S['fh'] + 0.1, 0.065, 0.004, 'badge', depth=0.006)
        # cab extender (air deflector closing the gap to the trailer)
        ext = st.get('extender', 'paint')
        if ext:
            eb = Buf()
            z_r = S['zr'] + 0.02
            ys = [S['fh'] + 0.25, S['top'] - 0.25]
            pts = [(s * (w - 0.02), ys[0], z_r + 0.04), (s * (w + 0.05), ys[0] + 0.03, z_r - 0.3), (s * (w + 0.05), ys[1] - 0.03, z_r - 0.3), (s * (w - 0.05), ys[1], z_r + 0.04)]
            ids = [b.add(p) for p in pts]
            b.face(ids, ext)
            b.face(list(reversed(ids)), ext)
            box(b, (s * (w + 0.03), (ys[0] + ys[1]) / 2, z_r - 0.31), (0.03, ys[1] - ys[0] - 0.08, 0.025), 'trim')


def roof_bits(b, S, F):
    st = S['style']
    w, top = S['w'], S['top']
    ws1 = S['ws1']
    # sun visor over the windscreen
    if st.get('visor'):
        vy = ws1 + st.get('visorY', 0.04)
        Wv, Fv, rv = F.at(vy)
        depth = st.get('visorD', 0.24)
        mat = st.get('visorMat', 'paint')
        rows = []
        for k, (dz, dy) in enumerate(((0.0, 0.0), (depth * 0.6, -0.025), (depth, -0.06))):
            row = []
            for j in range(13):
                u = -(Wv - 0.06) + 2 * (Wv - 0.06) * j / 12
                p = F.pt(u, vy, 0.01)
                bow = (1 - (u / Wv) ** 2) * 0.03
                row.append(b.add(p + Vector((0, dy, dz + bow * (k > 0)))))
            rows.append(row)
        lower = [[b.add(b.v[i] + Vector((0, -0.035, 0))) for i in row] for row in rows]
        for r0, r1 in zip(rows, rows[1:]):
            for j in range(12):
                b.face_out([r0[j], r0[j + 1], r1[j + 1], r1[j]], mat, Vector((0, vy - 1, S['zf'])), True)
        for r0, r1 in zip(lower, lower[1:]):
            for j in range(12):
                b.face_out([r0[j], r0[j + 1], r1[j + 1], r1[j]], 'plastic' if mat == 'paint' else mat, Vector((0, vy + 1, S['zf'])), True)
        for j in range(12):
            b.face_out([rows[-1][j], rows[-1][j + 1], lower[-1][j + 1], lower[-1][j]], mat, Vector((0, vy, S['zf'] - 1)))
        for i in range(5):
            u = -0.7 + i * 0.35
            p = b.v[rows[1][6]] + Vector((u, 0.012, 0))
            rbox(b, tuple(p + Vector((0, 0, 0.02))), (0.12, 0.03, 0.05), 0.012, 'marker', n=2)
    else:
        for i in range(5):
            u = -0.7 + i * 0.35
            p = F.pt(u, top - S['roofR'] * 0.35, 0.02)
            rbox(b, tuple(p), (0.12, 0.04, 0.05), 0.012, 'marker', n=2)
    # roof hatch, horns, antennas
    zc = (S['zf'] + S['zr']) / 2 + 0.2
    rbox(b, (0, top + 0.03, zc), (0.62, 0.08, 0.62), 0.04, 'plastic', n=2, bottom=False)
    rbox(b, (0, top + 0.07, zc), (0.5, 0.015, 0.5), 0.01, 'glass', n=1, bottom=False)
    for sx in (-0.32, 0.32):
        lathe(b, (sx, top + 0.07, S['zr'] + 0.5), 'z', [(0.0, -0.32), (0.035, -0.3), (0.035, 0.12), (0.075, 0.24), (0.08, 0.25), (0.0, 0.26)], 12, 'chrome', True)
    tube(b, [(-0.7, top, S['zr'] + 0.3), (-0.72, top + 0.55, S['zr'] + 0.22)], 0.006, 'trim', 4)
    tube(b, [(0.8, top, S['zr'] + 0.3), (0.8, top + 0.2, S['zr'] + 0.3)], 0.012, 'trim', 5)
    # front kerb mirror on the passenger side, over the windscreen
    if not st.get('noKerb'):
        p = F.pt(-(F.a(ws1) + 0.08), top - S['roofR'] * 0.5, 0.0)
        arm_end = p + Vector((0.12, -0.15, 0.32))
        tube(b, [p, p + Vector((0.0, 0.05, 0.2)), arm_end], 0.017, 'trim', 6)
        ex = Vector((1, 0, 0))
        ez = Vector((0, -0.55, -1)).normalized()
        ey = ez.cross(ex).normalized()
        rbox(b, tuple(arm_end + Vector((0, -0.08, 0))), (0.24, 0.16, 0.07), 0.03, st.get('mirrorMat', 'paint'), basis=(ex, ey, ez), n=2)


def cab_rear(b, S):
    w, zr, top, fh = S['w'], S['zr'], S['top'], S['fh']
    pl = Plane((0, 0, zr - 0.002), (-1, 0, 0), (0, 1, 0))
    # rear wall panel seams and the reflective marker strip
    shape(b, pl, rrect(-w + 0.15, w - 0.15, fh - 0.05, fh + 0.05, 0.0, 1), 0.004, 'plastic')
    shape(b, pl, rrect(-0.9, 0.9, top - 0.32, top - 0.28, 0.0, 1), 0.004, 'seam')
    for s in (1, -1):
        rbox(b, (s * (w - 0.12), top - 0.12, zr - 0.02), (0.12, 0.06, 0.05), 0.015, 'tail', n=2)
        rbox(b, (s * (w - 0.12), top - 0.2, zr - 0.02), (0.12, 0.05, 0.05), 0.015, 'reverse', n=2)
    # ladder rungs to the roof (when a stack or tall roof)
    if S.get('ladder', True):
        for k in range(4):
            box(b, (-0.62, fh + 0.4 + k * 0.32, zr - 0.06), (0.32, 0.03, 0.04), 'alu')
        for sx in (-0.78, -0.46):
            box(b, (sx, fh + 0.85, zr - 0.04), (0.03, 1.1, 0.03), 'alu')


# ---------- chassis ----------
def chassis(b, S):
    wb, R = S['wb'], S['R']
    six = S['axles'] == '6x4'
    z_end = S['zEnd']
    z_front = S['zf'] - 0.45
    y0, y1 = 0.78, 1.08
    st = S['style']
    for sx in (-1, 1):
        box(b, (sx * 0.43, (y0 + y1) / 2, (z_front + z_end) / 2), (0.012, y1 - y0, z_front - z_end), 'steel')
        for yy in (y0 + 0.006, y1 - 0.006):
            box(b, (sx * 0.43 - sx * 0.035, yy, (z_front + z_end) / 2), (0.08, 0.012, z_front - z_end), 'steel')
    for z in (z_front - 0.15, wb - 0.95, 0.95, -0.35, z_end + 0.08):
        box(b, (0, 0.96, z), (0.82, 0.16, 0.12), 'steel')
    # front axle (I beam), parabolic springs, steering box and drag link
    box(b, (0, 0.5, wb), (1.8, 0.14, 0.12), 'steel')
    for sx in (-1, 1):
        for k in range(2):
            tube(b, [(sx * 0.43, 0.74, wb + 0.75), (sx * 0.43, 0.66 - k * 0.03, wb + 0.2), (sx * 0.43, 0.62 - k * 0.03, wb), (sx * 0.43, 0.66 - k * 0.03, wb - 0.2), (sx * 0.43, 0.74, wb - 0.75)], 0.025, 'steel', 6)
        lathe(b, (sx * 0.62, 0.65, wb - 0.12), 'y', [(0.04, -0.15), (0.04, 0.15)], 8, 'steel', True)  # shock
        lathe(b, (sx * 0.86, R, wb), 'x', [(0.16, -0.06), (0.16, 0.06)], 16, 'steel', True)  # brake drum back
    box(b, (0.55, 0.84, wb + 0.45), (0.22, 0.25, 0.3), 'steel')
    tube(b, [(0.6, 0.72, wb + 0.4), (0.82, 0.56, wb + 0.1)], 0.025, 'steel', 6)
    # rear axles with differentials, air bags, shock absorbers
    axz = (0.675, -0.675) if six else (0.0,)
    for z in axz:
        lathe(b, (0, R, z), 'x', [(0.075, -0.95), (0.09, -0.6), (0.09, 0.6), (0.075, 0.95)], 12, 'steel', True)
        lathe(b, (0, R - 0.02, z), 'z', [(0.0, -0.36), (0.16, -0.3), (0.25, -0.1), (0.25, 0.05), (0.2, 0.2), (0.0, 0.28)], 14, 'steel', True)
        for sx in (-1, 1):
            box(b, (sx * 0.43, 0.68, z - 0.1), (0.1, 0.1, 1.2), 'steel')
            lathe(b, (sx * 0.43, 0.9, z - 0.55), 'y', [(0.12, -0.12), (0.13, -0.06), (0.13, 0.06), (0.12, 0.12)], 12, 'rubber', True, True)
            lathe(b, (sx * 0.43, 0.9, z + 0.42), 'y', [(0.11, -0.1), (0.12, 0.0), (0.11, 0.1)], 12, 'rubber', True, True)
            tube(b, [(sx * 0.62, 0.55, z + 0.15), (sx * 0.5, 0.95, z + 0.25)], 0.035, 'steel', 6)
            lathe(b, (sx * 0.86, R, z), 'x', [(0.2, -0.08), (0.2, 0.08)], 16, 'steel', True)
    # propeller shaft
    tube(b, [(0, 0.62, wb - 1.0), (0, R + 0.05, axz[0] + 0.3)], 0.05, 'steel', 8)
    # fuel tank on the driver's side (D section, aluminium) with straps and cap
    tl = S['tankLen']
    tz1 = wb - S['R'] - 0.25
    tz0 = tz1 - tl
    td = [(-0.32, 0.0), (0.0, 0.0), (0.1, 0.03), (0.17, 0.1), (0.2, 0.2), (0.2, 0.42), (0.17, 0.52), (0.1, 0.59), (0.0, 0.62), (-0.32, 0.62)]
    if S['tank'] == 'box':
        td = [(-0.32, 0.0), (0.12, 0.0), (0.2, 0.06), (0.2, 0.58), (0.12, 0.64), (-0.32, 0.64)]
    tank_x = 0.82
    prism(b, [(-u, v) for u, v in td], (tank_x, 0.48, tz1), (tank_x, 0.48, tz0), 'alu', smooth=True)
    for k in (0.15, tl - 0.15):
        prism(b, [(-u * 1.03, v * 1.03 - 0.009) for u, v in td], (tank_x, 0.48, tz1 - k + 0.025), (tank_x, 0.48, tz1 - k - 0.025), 'steel')
    lathe(b, (tank_x + 0.08, 1.12, tz1 - 0.3), 'y', [(0.07, 0), (0.07, 0.04), (0.0, 0.05)], 12, 'chrome', True)
    # battery box, AdBlue and air tanks on the other side
    bx = -0.86
    rbox(b, (bx, 0.78, tz1 - 0.4), (0.5, 0.5, 0.7), 0.03, 'plastic', n=2)
    lathe(b, (bx, 0.78, tz1 - 1.05), 'z', [(0.0, -0.26), (0.22, -0.25), (0.25, -0.2), (0.25, 0.2), (0.22, 0.25), (0.0, 0.26)], 16, 'plastic', True)
    lathe(b, (bx, 1.04, tz1 - 1.05), 'y', [(0.05, 0), (0.05, 0.04), (0.0, 0.05)], 10, 'adblue', True)
    for z in (wb - 0.65, 0.55 if not six else 1.45):
        lathe(b, (-0.62, 0.8, z), 'z', [(0.0, -0.32), (0.11, -0.3), (0.12, -0.25), (0.12, 0.25), (0.11, 0.3), (0.0, 0.32)], 12, 'steel', True)
    # exhaust silencer behind the right front wheel, tail pipe or a stack behind the cab
    rbox(b, (-0.85, 0.72, wb - 1.0), (0.5, 0.55, 0.62), 0.06, 'steel', n=2)
    if S.get('stack'):
        x = -(S['w'] - 0.12)
        z = S['zr'] - 0.14
        tube(b, [(x, 0.95, z), (x, 2.0, z), (x, S['top'] - 0.1, z), (x, S['top'] + 0.3, z + 0.04)], 0.07, 'chrome', 12)
        lathe(b, (x, 2.0, z), 'y', [(0.095, -0.6), (0.095, 0.6)], 14, 'chrome', True)  # heat shield
    else:
        tube(b, [(-0.85, 0.55, wb - 1.25), (-0.9, 0.42, wb - 1.4), (-1.05, 0.4, wb - 1.45)], 0.05, 'steel', 8)
    # fifth wheel with its V slot, mounting and the deck behind the cab
    k = S['king']
    lathe(b, (0, 1.25, k), 'y', [(0.0, 0.0), (0.5, 0.0), (0.52, -0.06), (0.4, -0.12)], 24, 'steel', True)
    box(b, (0, 1.252, k - 0.32), (0.1, 0.004, 0.36), 'rimdark')
    box(b, (0, 1.24, k - 0.6), (0.6, 0.02, 0.2), 'steel', rot_x=-0.25)
    for sx in (-1, 1):
        box(b, (sx * 0.43, 1.14, k), (0.12, 0.12, 0.8), 'steel')
        box(b, (sx * 0.6, 1.24, k - 0.55), (0.25, 0.02, 0.3), 'steel', rot_x=-0.3)
    box(b, (0, 1.115, (S['zr'] + k + 0.55) / 2), (0.85, 0.02, S['zr'] - k - 0.6), 'alu')
    # air and electric lines hanging from the back of the cab to a gooseneck
    gx = 0.15
    tube(b, [(gx, 1.1, S['zr'] - 0.25), (gx, 1.9, S['zr'] - 0.25), (gx, 2.05, S['zr'] - 0.35)], 0.025, 'steel', 6)
    for i, mat in enumerate(('airRed', 'airYellow', 'rubber')):
        pts = []
        x0 = gx - 0.12 + i * 0.12
        for t in range(48):
            a = t * 0.62
            fall = t / 48
            pts.append((x0 + math.cos(a) * 0.055, 2.0 - fall * 0.62 + math.sin(t * 0.08) * 0.01, S['zr'] - 0.42 - math.sin(a) * 0.055 - fall * 0.32))
        tube(b, pts, 0.011, mat, 5)
    # rear mudguards and flaps
    for sx in (-1, 1):
        if six:
            zc0, zc1 = 0.675 + R + 0.15, -0.675 - R - 0.12
        else:
            zc0, zc1 = R + 0.15, -R - 0.12
        xg = sx * 1.02
        top_y = 2 * R + 0.12
        prism(b, [(-0.32, 0.0), (0.33, 0.0), (0.33, 0.02), (-0.32, 0.02)], (xg, top_y, zc0), (xg, top_y, zc1), 'plastic', up=Vector((0, 1, 0)))
        # sloped front section
        prism(b, [(-0.32, 0.0), (0.33, 0.0), (0.33, 0.02), (-0.32, 0.02)], (xg, top_y - 0.35, zc0 + 0.25), (xg, top_y, zc0), 'plastic')
        box(b, (xg, 0.62, zc1 - 0.01), (0.62, 0.72, 0.015), 'rubber')
        box(b, (sx * 0.66, top_y - 0.1, zc1 + 0.2), (0.06, 0.2, 0.06), 'steel')
    # rear light bar: three-chamber lamps, reflectors, plate with a lamp
    box(b, (0, 0.62, z_end), (2.0, 0.12, 0.06), 'steel')
    for sx in (-1, 1):
        cx = sx * 0.72
        rbox(b, (cx, 0.62, z_end - 0.05), (0.42, 0.15, 0.08), 0.02, 'trim', n=2)
        pl = Plane((cx, 0.62, z_end - 0.092), (-1, 0, 0), (0, 1, 0))
        shape(b, pl, rrect(-0.19 * sx, -0.06 * sx, -0.055, 0.055, 0.01) if sx > 0 else rrect(0.06, 0.19, -0.055, 0.055, 0.01), 0.002, 'ind_L' if sx > 0 else 'ind_R')
        shape(b, pl, rrect(-0.05, 0.05, -0.055, 0.055, 0.01), 0.002, 'tail')
        shape(b, pl, rrect(0.06 * sx, 0.19 * sx, -0.055, 0.055, 0.01) if sx > 0 else rrect(-0.19, -0.06, -0.055, 0.055, 0.01), 0.002, 'reverse')
        rbox(b, (sx * 0.98, 0.5, z_end - 0.04), (0.08, 0.08, 0.02), 0.01, 'tail', n=1)
    rbox(b, (0, 0.74, z_end - 0.04), (0.56, 0.16, 0.03), 0.01, 'trim', n=1)
    pl = Plane((0, 0.74, z_end - 0.057), (-1, 0, 0), (0, 1, 0))
    shape(b, pl, rrect(-0.26, 0.26, -0.056, 0.056, 0.008), 0.0, 'plate')
    text_on(b, pl, S.get('plate', 'Т 777 ДР 16'), 0.0, -0.004, 0.072, 0.0, 'ink', depth=0.003, spacing=1.05)
    # side skirts (aerodynamic panels) over the tanks
    if S.get('skirts'):
        z0 = wb - R - 0.2
        z1 = (0.675 if six else 0.0) + R + 0.2
        for sx in (-1, 1):
            sd = Plane((sx * (S['w'] - 0.04), 0, 0), (0, 0, -sx), (0, 1, 0))
            pts = [(-sx * z0, 0.5), (-sx * z1, 0.5), (-sx * z1, 1.1), (-sx * z0, 1.1)]
            shape(b, sd, rpoly(pts, [0.06, 0.06, 0.02, 0.02], 3), 0.0, st.get('skirtMat', 'paint'), back=True)
            shape(b, sd, rpoly([(-sx * z0, 0.5), (-sx * z1, 0.5), (-sx * z1, 0.6), (-sx * z0, 0.6)], [0.06, 0.06, 0.0, 0.0], 3), 0.004, 'plastic')


# ---------- mirrors ----------
def mirrors(b, S, eye):
    """Main and wide-angle mirrors on arms; the glass quads are exported as nodes (for render targets)."""
    out = {}
    w = S['w']
    st = S['style']
    mat = st.get('mirrorMat', 'paint')
    for side, sx in (('L', 1), ('R', -1)):
        m = Vector((sx * (w + 0.33), S['ws0'] + 0.62, S['zf'] - S['rf'] - 0.08))
        target = Vector((sx * (w + 0.55), 1.1, -20.0))
        e = Vector(eye)
        n = ((e - m).normalized() + (target - m).normalized()).normalized()
        up = Vector((0, 1, 0))
        right = up.cross(n).normalized()
        upv = n.cross(right).normalized()
        gw, gh = 0.21, 0.36
        # housings: rounded boxes behind each glass, glass facing n
        rbox(b, tuple(m - n * 0.045), (gw + 0.05, gh + 0.05, 0.09), 0.035, mat, basis=(right, upv, n), n=3)
        m2 = m - upv * (gh / 2 + 0.135)
        rbox(b, tuple(m2 - n * 0.04), (gw + 0.04, 0.2, 0.08), 0.03, mat, basis=(right, upv, n), n=3)
        # black bezel
        pl = Plane(m, right, upv)
        frame(b, pl, rrect(-gw / 2 - 0.022, gw / 2 + 0.022, -gh / 2 - 0.022, gh / 2 + 0.022, 0.03), rrect(-gw / 2, gw / 2, -gh / 2, gh / 2, 0.012), 0.002, 'trim')
        pl2 = Plane(m2, right, upv)
        frame(b, pl2, rrect(-gw / 2 - 0.018, gw / 2 + 0.018, -0.096, 0.096, 0.025), rrect(-gw / 2, gw / 2, -0.078, 0.078, 0.012), 0.002, 'trim')
        # arm: from the door frame up front, a bar forward and out to the housings
        root = Vector((sx * (w - 0.01), S['ws0'] + 0.15, S['zf'] - S['rf'] - 0.16))
        root2 = Vector((sx * (w - 0.01), S['ws1'] - 0.05, S['zf'] - S['rf'] - S['rake'] * 0.7 - 0.2))
        rbox(b, tuple(root), (0.05, 0.12, 0.14), 0.02, 'trim', n=2)
        rbox(b, tuple(root2), (0.05, 0.1, 0.12), 0.02, 'trim', n=2)
        tube(b, [root + Vector((sx * 0.02, 0, 0)), root + Vector((sx * 0.18, 0.05, 0.08)), m2 - n * 0.06 - upv * 0.06], 0.022, 'trim', 8)
        tube(b, [root2 + Vector((sx * 0.02, 0, 0)), root2 + Vector((sx * 0.2, 0.02, 0.1)), m - n * 0.07 + upv * (gh / 2 - 0.04)], 0.02, 'trim', 8)
        # glass quads as separate meshes with uv (the game draws the reflection into them)
        for name, mc, hw, hh in (('mirror_' + side, m, gw / 2, gh / 2), ('mirrorw_' + side, m2, gw / 2, 0.078)):
            g = Buf()
            q = [mc + n * 0.003 + right * a * hw + upv * c * hh for a, c in ((-1, -1), (1, -1), (1, 1), (-1, 1))]
            ids = [g.add(v) for v in q]
            uvs = [(0, 0), (1, 0), (1, 1), (0, 1)]
            nrm = (q[1] - q[0]).cross(q[3] - q[0])
            if nrm.dot(n) < 0:
                ids = list(reversed(ids))
                uvs = list(reversed(uvs))
            g.face(ids, 'mirror_glass', False, uvs)
            out[name] = (g, mc, n, right, upv, hw, hh)
    return out


# ---------- interior ----------
def interior(b, S, eye):
    fh, zf, zr, w = S['fh'], S['zf'], S['zr'], S['w']
    st = S['style']
    sx = S['seatX']
    dmat = st.get('dashMat', 'dash')
    lmat = st.get('dashLower', 'dash2')
    trimm = st.get('dashTrim', 'dashtrim')
    zd = zf - 0.1  # windscreen base inside
    # floor, mats and the engine tunnel
    box(b, (0, fh - 0.03, (zf + zr) / 2), (2 * w - 0.12, 0.06, zf - zr - 0.1), 'carpet')
    for s in (1, -1):
        rbox(b, (s * sx, fh + 0.005, zf - 0.75), (0.55, 0.012, 0.65), 0.03, 'rubber', n=1)
    if not S.get('flatFloor'):
        rbox(b, (0, fh + 0.1, zf - 0.85), (0.75, 0.24, 1.3), 0.08, 'carpet', n=2)
    # dashboard: a profile swept across the cab, the driver's side pulled toward the driver
    def prof(x):
        k = max(0.0, min(1.0, (x - 0.1) / 0.5))  # 0 passenger side .. 1 driver side
        back = 0.66 + 0.06 * k
        return [(zd + 0.02, fh + 0.78), (zd - 0.25, fh + 0.84), (zd - back + 0.08, fh + 0.86), (zd - back, fh + 0.8),
                (zd - back - 0.02, fh + 0.66), (zd - back + 0.04, fh + 0.48), (zd - back + 0.18, fh + 0.22), (zd - back + 0.3, fh + 0.0)]
    xs = [-(w - 0.08), -0.9, -0.5, -0.15, 0.1, 0.3, 0.6, 0.9, w - 0.08]
    rows = [[b.add((x, y, z)) for z, y in prof(x)] for x in xs]
    np_ = len(rows[0])
    for i in range(len(xs) - 1):
        for k in range(np_ - 1):
            mat = dmat if k < 3 else (trimm if k == 3 else lmat)
            b.face_out([rows[i][k], rows[i][k + 1], rows[i + 1][k + 1], rows[i + 1][k]], mat, (0, fh + 0.4, zd + 0.3), True)
    for row, ref in ((rows[0], (1, fh + 0.5, zd - 0.3)), (rows[-1], (-1, fh + 0.5, zd - 0.3))):
        b.face_out(row, lmat, ref)
    # instrument binnacle on the driver's side: hood, surround and the cluster quad
    bz = zd - 0.72
    # binnacle: a swept cowl rising from the dash top over a recess for the cluster, tapering into the dash at its ends
    cowl = [(zd - 0.32, 0.86), (bz + 0.1, 1.03), (bz - 0.06, 1.065), (bz - 0.125, 1.05), (bz - 0.13, 1.025), (bz - 0.09, 1.005),
            (bz - 0.02, 0.995), (bz - 0.02, 0.83), (bz - 0.08, 0.82), (bz - 0.1, 0.78), (zd - 0.55, 0.78)]
    half = 0.33
    xs_c = [sx - half + half * k / 6 for k in range(7)] + [sx + half * k / 6 for k in range(1, 7)]
    crings = []
    for x in xs_c:
        t = min(1.0, (half - abs(x - sx)) / 0.1)
        k = math.sin(t * math.pi / 2) if t < 1 else 1.0
        k = max(0.08, k)
        crings.append([b.add((x, fh + 0.84 + (y - 0.84) * k if y > 0.84 else fh + y, z)) for z, y in cowl])
    nc = len(cowl)
    for i in range(len(crings) - 1):
        for j in range(nc - 1):
            mat = dmat if j < 4 else 'dash'
            b.face_out([crings[i][j], crings[i][j + 1], crings[i + 1][j + 1], crings[i + 1][j]], mat, (sx, fh + 0.9, bz + 0.0), True)
    for ring, sgn in ((crings[0], -1), (crings[-1], 1)):
        b.face_out(ring, dmat, (sx - sgn * 1.0, fh + 0.9, bz))
    gauges = Buf()
    tilt = 0.3
    cy, cz = fh + 0.918, bz - 0.06
    up = Vector((0, math.cos(tilt), -math.sin(tilt)))
    hw, hh = 0.23, 0.072
    c = Vector((sx, cy, cz))
    q = [c + Vector((-a * hw, 0, 0)) + up * bb * hh for a, bb in ((-1, -1), (1, -1), (1, 1), (-1, 1))]
    ids = [gauges.add(v) for v in q]
    uvs = [(0, 0), (1, 0), (1, 1), (0, 1)]
    nrm = (q[1] - q[0]).cross(q[3] - q[0])
    if nrm.z > 0:
        ids = list(reversed(ids))
        uvs = list(reversed(uvs))
    gauges.face(ids, 'gauges', False, uvs)
    pl = Plane(c - Vector((0, 0, 0.004)), Vector((-1, 0, 0)), up)
    frame(b, pl, rrect(-hw - 0.03, hw + 0.03, -hh - 0.03, hh + 0.03, 0.04), rrect(-hw, hw, -hh, hh, 0.02), -0.002, 'dashtrim')
    # switch panels either side of the binnacle
    for s in (1, -1):
        px = sx + s * 0.4
        for kx in range(2):
            for ky in range(3):
                rbox(b, (px + (kx - 0.5) * 0.05, fh + 0.86 + ky * 0.05, bz - 0.06 - ky * 0.01), (0.04, 0.03, 0.02), 0.006, 'button', n=1)
    # centre stack turned toward the driver: screen, controls, vents
    ry = -0.32
    cstack = Vector((0.12, fh + 0.66, zd - 0.73))
    rbox(b, tuple(cstack), (0.46, 0.5, 0.12), 0.04, lmat, rot_y=ry, rot_x=-0.18, n=2)
    scr = cstack + rot_vec((0, 0.1, -0.066), ry, -0.18)
    rbox(b, tuple(scr), (0.3, 0.17, 0.012), 0.01, 'display', rot_y=ry, rot_x=-0.18, n=1)
    for k in range(3):
        kn = cstack + rot_vec((-0.12 + k * 0.12, -0.12, -0.07), ry, -0.18)
        lathe(b, tuple(kn), 'z', [(0.026, 0.0), (0.026, -0.02), (0.022, -0.026), (0.0, -0.027)], 14, 'dashtrim', True,
              basis=(rot_vec((1, 0, 0), ry, -0.18), rot_vec((0, 1, 0), ry, -0.18), rot_vec((0, 0, 1), ry, -0.18)))
    for kx in range(5):
        bt = cstack + rot_vec((-0.16 + kx * 0.08, -0.2, -0.062), ry, -0.18)
        rbox(b, tuple(bt), (0.06, 0.03, 0.012), 0.006, 'button', rot_y=ry, rot_x=-0.18, n=1)
    # air vents
    for vx in (-(w - 0.35), -0.42, 0.3, sx + 0.42):
        vz = zd - (0.68 if vx < 0.2 else 0.78)
        rbox(b, (vx, fh + 0.73, vz), (0.18, 0.09, 0.03), 0.015, 'trim', n=1)
        for k in range(3):
            box(b, (vx, fh + 0.705 + k * 0.025, vz - 0.017), (0.16, 0.006, 0.01), 'dashtrim')
    # glovebox and a shelf on the passenger side, parking brake handle by the driver
    shape(b, Plane((-0.75, fh + 0.6, zd - 0.69), (-1, 0, 0), (0, 1, 0.12)), rrect(-0.24, 0.24, -0.1, 0.1, 0.03), 0.004, 'seam')
    rbox(b, (sx + 0.42, fh + 0.62, zd - 0.8), (0.05, 0.08, 0.05), 0.012, 'airYellow', n=1)
    # steering column with stalks, pedals
    swc = Vector(S['wheelC'])
    ez = Vector((0, -math.sin(S['wheelTilt']), math.cos(S['wheelTilt'])))
    ex = Vector((1, 0, 0))
    ey = ez.cross(ex).normalized()
    rbox(b, tuple(swc + ez * 0.3), (0.13, 0.12, 0.42), 0.045, 'dash', basis=(ex, ey, ez), n=2)
    lathe(b, tuple(swc + ez * 0.07), 'z', [(0.05, -0.04), (0.055, 0.0), (0.05, 0.04)], 12, 'dash', True, basis=(ex, ey, ez))
    for s in (1, -1):
        tube(b, [swc + Vector((s * 0.06, -0.02, 0.1)), swc + Vector((s * 0.2, -0.02, 0.08))], 0.009, 'trim', 6)
        rbox(b, tuple(swc + Vector((s * 0.21, -0.02, 0.08))), (0.04, 0.025, 0.03), 0.008, 'trim', n=1)
    for px, wdt in ((-0.2, 0.08), (-0.02, 0.12), (0.17, 0.07)):
        if px == -0.2 and st.get('auto', True):
            continue
        rbox(b, (sx + px, fh + 0.2, zd - 0.48), (wdt, 0.2, 0.03), 0.012, 'rubber', rot_x=-0.55, n=1)
    # gear lever between the seats on manual trucks, a selector on the seat side on automated ones
    if not st.get('auto', True):
        tube(b, [(0.12, fh + 0.1, zf - 1.15), (0.14, fh + 0.55, zf - 1.3)], 0.014, 'trim', 6)
        lathe(b, (0.14, fh + 0.58, zf - 1.31), 'y', [(0.0, -0.04), (0.035, -0.03), (0.04, 0.0), (0.03, 0.03), (0.0, 0.04)], 12, 'leather', True)
        rbox(b, (0.12, fh + 0.06, zf - 1.15), (0.14, 0.1, 0.14), 0.03, 'rubber', n=1)
    else:
        rbox(b, (sx - 0.36, fh + 0.5, S['seatZ'] + 0.12), (0.1, 0.06, 0.22), 0.025, lmat, n=2)
        tube(b, [(sx - 0.36, fh + 0.52, S['seatZ'] + 0.18), (sx - 0.36, fh + 0.66, S['seatZ'] + 0.22)], 0.012, 'trim', 6)
        rbox(b, (sx - 0.36, fh + 0.69, S['seatZ'] + 0.23), (0.05, 0.07, 0.06), 0.02, 'leather', n=2)
    # seats: cushion, backrest with bolsters, headrest, armrests, suspension skirt, belt
    for sxp in (sx, -sx):
        sz = S['seatZ']
        rbox(b, (sxp, fh + 0.2, sz), (0.42, 0.34, 0.44), 0.04, 'rubber', n=2)
        rbox(b, (sxp, fh + 0.44, sz + 0.02), (0.54, 0.13, 0.54), 0.05, 'seat', n=3)
        for s in (1, -1):
            rbox(b, (sxp + s * 0.22, fh + 0.5, sz + 0.02), (0.1, 0.1, 0.5), 0.04, 'seat', n=2)
        bk = Vector((sxp, fh + 0.88, sz - 0.28))
        rbox(b, tuple(bk), (0.52, 0.74, 0.12), 0.05, 'seat', rot_x=-0.22, n=3)
        for s in (1, -1):
            rbox(b, tuple(bk + rot_vec((s * 0.23, -0.05, 0.05), 0, -0.22)), (0.08, 0.55, 0.12), 0.035, 'seat', rot_x=-0.22, n=2)
        rbox(b, tuple(bk + rot_vec((0, 0.47, -0.03), 0, -0.22)), (0.3, 0.2, 0.1), 0.04, 'seat', rot_x=-0.22, n=3)
        rbox(b, tuple(bk + rot_vec((0, 0.05, 0.065), 0, -0.22)), (0.32, 0.5, 0.01), 0.004, st.get('seatInsert', 'seat2'), rot_x=-0.22, n=1)
        arm_x = sxp - 0.31 if sxp > 0 else sxp + 0.31
        rbox(b, (arm_x, fh + 0.66, sz + 0.02), (0.06, 0.06, 0.34), 0.025, 'seat', n=2)
        bx = sxp + (0.24 if sxp > 0 else -0.24)
        tube(b, [(bx, fh + 1.3, sz - 0.42), (sxp + (0.08 if sxp > 0 else -0.08), fh + 0.95, sz - 0.25), (sxp - (0.2 if sxp > 0 else -0.2), fh + 0.52, sz - 0.08)], 0.012, 'rubber', 4)
    # door trim: panel, armrest, pull handle, speaker, window switches, map pocket
    for s in (1, -1):
        dpl = Plane((s * (w - 0.07), 0, 0), (0, 0, s), (0, 1, 0))
        zc = (S['dw0'] + S['dw1']) / 2
        x = s * (w - 0.075)
        rbox(b, (x, fh + 0.5, zc), (0.05, 0.78, S['dw0'] - S['dw1'] - 0.06), 0.02, 'panel', n=2)
        rbox(b, (x - s * 0.05, fh + 0.72, zc - 0.08), (0.08, 0.05, 0.5), 0.02, lmat, n=2)
        rbox(b, (x - s * 0.04, fh + 0.27, zc + 0.02), (0.06, 0.14, 0.62), 0.02, lmat, n=2)
        lathe(b, (x - s * 0.03, fh + 0.27, zc + 0.24), 'x', [(0.075, 0.0), (0.075, -s * 0.004), (0.0, -s * 0.006)], 18, 'grille', True)
        for k in range(3):
            rbox(b, (x - s * 0.07, fh + 0.755, zc + 0.05 + k * 0.05), (0.02, 0.012, 0.03), 0.005, 'button', n=1)
        tube(b, [(x - s * 0.03, fh + 0.86, S['dw1'] + 0.3), (x - s * 0.06, fh + 0.86, S['dw1'] + 0.36), (x - s * 0.06, fh + 0.86, S['dw1'] + 0.5), (x - s * 0.03, fh + 0.86, S['dw1'] + 0.56)], 0.012, 'dashtrim', 6)
    # A pillar trims and grab handles; bunched curtains at the pillars
    for s in (1, -1):
        Wp, Fp, rp = S['cabSurf'].at(S['ws0'] + 0.4)
        ax = s * (Wp - 0.12)
        az = Fp - 0.12
        tube(b, [(s * (Wp - 0.1), S['ws0'] - 0.02, az + 0.0), (s * (Wp - 0.11), S['ws1'] - 0.02, az - S['rake'] + 0.0)], 0.035, 'panel', 8)
        tube(b, [(s * (w - 0.1), S['ws0'] + 0.15, az - 0.2), (s * (w - 0.11), S['ws0'] + 0.55, az - S['rake'] * 0.6 - 0.2)], 0.014, 'dash2', 6)
        # curtains gathered behind the door, at the front of the sleeper
        for k in range(5):
            zz = S['wz1'] - 0.06 - k * 0.035
            tube(b, [(s * (w - 0.09), S['wy0'] - 0.05, zz), (s * (w - 0.1 - (k % 2) * 0.02), (S['wy0'] + S['wy1']) / 2, zz), (s * (w - 0.09), S['top'] - 0.18, zz)], 0.018, 'curtain', 6)
    # overhead: shelf with lockers over the windscreen, centre console with radio and tachograph
    if S['roof'] != 'low':
        oy = S['ws1'] + 0.16
        oz = zd - S['rake'] - 0.36
        rbox(b, (0, oy, oz), (2 * w - 0.3, 0.22, 0.36), 0.05, lmat, n=2)
        for i in range(4):
            u = -0.85 + i * 0.57
            pl = Plane((u, oy, oz - 0.182), (-1, 0, 0), (0, 1, 0))
            shape(b, pl, rrect(-0.26, 0.26, -0.08, 0.08, 0.04), 0.002, dmat, depth=0.004)
            rbox(b, (u, oy - 0.07, oz - 0.19), (0.12, 0.022, 0.02), 0.008, 'dashtrim', n=1)
        rbox(b, (0.0, oy - 0.15, oz + 0.02), (0.56, 0.1, 0.28), 0.03, lmat, n=2)
        for k, (u, wd) in enumerate(((-0.13, 0.22), (0.13, 0.22))):
            pl = Plane((u, oy - 0.15, oz - 0.122), (-1, 0, 0), (0, 1, 0))
            shape(b, pl, rrect(-wd / 2, wd / 2, -0.03, 0.03, 0.006), 0.002, 'display')
            shape(b, pl, rrect(-wd / 2 + 0.01, -wd / 2 + 0.07, -0.022, 0.022, 0.004), 0.004, 'button')
    # sun visors, interior light, rear-view of the bunk: mattress, curtain, storage under the bunk
    for s in (1, -1):
        Wv, Fv, rv = S['cabSurf'].at(S['ws1'] - 0.05)
        rbox(b, (s * 0.55, S['ws1'] + 0.02, Fv - 0.28), (0.82, 0.24, 0.025), 0.012, 'panel', rot_x=1.35, n=2)
    rbox(b, (0, S['top'] - 0.1, (zf + zr) / 2), (0.3, 0.03, 0.12), 0.012, 'lens', n=1)
    rbox(b, (0, fh + 0.5, zr + 0.4), (2 * w - 0.22, 0.16, 0.68), 0.06, 'seat', n=3)
    rbox(b, (0, fh + 0.36, zr + 0.4), (2 * w - 0.2, 0.12, 0.72), 0.02, lmat, n=1)
    rbox(b, (0, fh + 0.22, zr + 0.62), (2 * w - 0.25, 0.4, 0.04), 0.01, 'dash', n=1)
    if S['roof'] in ('high', 'xl'):
        rbox(b, (0, S['top'] - 0.42, zr + 0.4), (2 * w - 0.22, 0.12, 0.7), 0.04, 'seat', n=2)
        box(b, (0, S['top'] - 0.49, zr + 0.4), (2 * w - 0.2, 0.03, 0.72), lmat)
    box(b, (0, (fh + S['top']) / 2, zr + 0.06), (2 * w - 0.16, S['top'] - fh - 0.2, 0.03), 'curtain')
    return gauges


def steering_wheel(S):
    """Steering wheel around the origin with its axis on local z (the node is placed and the geometry tilted)."""
    b = Buf()
    st = S['style']
    R = 0.235
    n = 36
    tub = 0.024
    rings = []
    for i in range(n):
        a = 2 * math.pi * i / n
        c = Vector((math.cos(a) * R, math.sin(a) * R, 0))
        rd = Vector((math.cos(a), math.sin(a), 0))
        th = tub * (1.15 if math.sin(a) > 0.3 else 1.0)
        rings.append([b.add(c + (rd * math.cos(2 * math.pi * k / 10) * th + Vector((0, 0, 1)) * math.sin(2 * math.pi * k / 10) * tub)) for k in range(10)])
    for i in range(n):
        i2 = (i + 1) % n
        a = 2 * math.pi * (i + 0.5) / n
        for k in range(10):
            k2 = (k + 1) % 10
            b.face_out([rings[i][k], rings[i2][k], rings[i2][k2], rings[i][k2]], 'leather', (math.cos(a) * R, math.sin(a) * R, 0), True)
    spokes = st.get('spokes', (math.pi + 0.15, -0.15, -math.pi / 2))
    for a in spokes:
        p0 = Vector((math.cos(a) * 0.075, math.sin(a) * 0.075, 0.03))
        p1 = Vector((math.cos(a) * (R - 0.012), math.sin(a) * (R - 0.012), 0.0))
        d = (p1 - p0)
        ex = d.normalized()
        ez = Vector((0, 0, 1))
        ez = (ez - ex * ex.dot(ez)).normalized()
        ey = ez.cross(ex).normalized()
        rbox(b, tuple((p0 + p1) / 2), (d.length, 0.055 if abs(math.sin(a)) < 0.5 else 0.04, 0.025), 0.01, 'dash', basis=(ex, ey, ez), n=2)
        if abs(math.sin(a)) < 0.5:
            for k in range(2):
                for kk in range(2):
                    p = p0 + d * (0.35 + 0.25 * k) + ey * (0.012 * (1 if kk else -1)) + Vector((0, 0, 0.016))
                    rbox(b, tuple(p), (0.022, 0.018, 0.008), 0.004, 'button', basis=(ex, ey, ez), n=1)
    rbox(b, (0, -0.005, 0.035), (0.15, 0.13, 0.06), 0.035, 'leather', n=3)
    return b


# ---------- the lineup ----------
def base_spec(**kw):
    S = dict(axles='4x2', wb=3.7, over=1.42, fh=1.48, w=1.245, cabLen=2.3, roof='high', rf=0.16, rb=0.1, rake=0.3, lean=0.03,
             R=0.53, seatX=0.6, yfb=0.95, yb=1.12, wsBase=0.8, wsH=0.95, tumble=0.035, roofR=0.2, roofBack=0.2, dip=0.12,
             tank='D', tankLen=1.3, bumperOut=0.07, stack=False, skirts=False, plate='Т 777 ДР 16')
    S.update(kw)
    S['top'] = {'low': 3.2, 'mid': 3.55, 'high': 3.88, 'xl': 4.0}[S['roof']]
    S['zf'] = S['wb'] + S['over']
    S['zr'] = S['zf'] - S['cabLen']
    S['ws0'] = S['fh'] + S['wsBase']
    S['ws1'] = min(S['top'] - S['roofR'] - 0.08, S['ws0'] + S['wsH'])
    S['xw'] = S['w'] - S['rf'] - 0.03
    S['dw0'] = S['zf'] - S['rf'] - 0.1
    S['dw1'] = S['zf'] - 1.38
    S['wz0'] = S['dw0'] - 0.03
    S['wz1'] = S['dw1'] + 0.08
    S['wy0'] = S['fh'] + 0.98
    S['wy0f'] = S['wy0'] - S['dip']
    S['wy1'] = S['ws1'] - 0.05
    S['king'] = 0.35 if S['axles'] == '6x4' else 0.55
    S['zEnd'] = -1.68 if S['axles'] == '6x4' else -1.0
    S['eye'] = (S['seatX'], S['fh'] + 1.36, S['zf'] - 1.62)
    S['seatZ'] = S['zf'] - 1.41
    S['wheelTilt'] = S.get('wheelTilt', 0.8)
    S['wheelC'] = (S['seatX'], S['fh'] + 0.95, S['zf'] - 1.08)
    S['bumperY'] = (S.get('bumperLow', 0.4), S['yfb'] + 0.02)
    return S


def style(**kw):
    return kw


def face_lamps_corner(u_in, v0, v1, top_in_drop=0.0, wrap=0.2, r=0.04):
    """Lamp housing in the lower corner: from u_in to the corner and round it."""
    return lambda a: rpoly([(u_in, v0), (a + wrap, v0), (a + wrap, v1), (u_in, v1 - top_in_drop)], [r, r * 1.5, r * 2, r], 4)


TRUCKS = {}


def add(tid, **kw):
    TRUCKS[tid] = kw


# Each design gets its proportions and a face; corner-wrapping lamps are given relative to the face half width a.
add('atlant', name='Атлант FX', badge='АТЛАНТ', axles='6x4', wb=3.9, roof='xl', rf=0.15, rake=0.3, dip=0.2, doorText='FX 540',
    design='atlant')
add('sever', name='Северянин R', badge='СЕВЕРЯНИН', roof='high', rf=0.27, rake=0.26, dip=0.08, design='sever')
add('titan', name='Титан TG', badge='ТИТАН', roof='xl', rf=0.13, rake=0.32, dip=0.14, design='titan')
add('ladoga', name='Ладога XF', badge='ЛАДОГА', roof='xl', rf=0.08, rake=0.18, dip=0.0, design='ladoga')
add('orion', name='Орион AC', badge='ОРИОН', axles='6x4', wb=3.9, roof='high', rf=0.2, rake=0.36, dip=0.1, design='orion')
add('vektor', name='Вектор T', badge='ВЕКТОР', roof='high', rf=0.1, rake=0.12, dip=0.0, design='vektor')
add('vega', name='Вега SW', badge='ВЕГА', roof='high', rf=0.16, rake=0.38, dip=0.12, design='vega')
add('buran', name='Буран К5', badge='БУРАН', axles='6x4', wb=3.9, roof='high', rf=0.1, rake=0.34, dip=0.06, design='buran')
add('taiga', name='Тайга 5490', badge='ТАЙГА', roof='mid', rf=0.14, rake=0.22, dip=0.0, fh=1.42, design='taiga')
add('neman', name='Неман 544', badge='НЕМАН', roof='mid', rf=0.3, rake=0.2, dip=0.0, fh=1.4, wb=3.95, design='neman')
add('enisey', name='Енисей C7', badge='ЕНИСЕЙ', axles='6x4', wb=3.9, roof='high', rf=0.13, rake=0.3, dip=0.1, stack=True, design='enisey')
add('polyus', name='Полюс X3', badge='ПОЛЮС', axles='6x4', wb=3.9, roof='xl', rf=0.15, rake=0.32, dip=0.06, stack=True, design='polyus')


def design(S):
    """Face, cab and interior styling per truck (approximate real proportions, fictional names, no logos)."""
    d = S['design']
    yfb, ws0, fh = S['yfb'], S['ws0'], S['fh']
    a = S['w'] - S['rf']
    st = dict(visor=False, mirrorMat='paint', dashMat='dash', auto=True)
    lo_v0, lo_v1 = yfb + 0.04, yfb + 0.33  # lamp band in the lower corners
    if d == 'atlant':
        st.update(
            grille=dict(corners=[(0.0, 1.4), (0.6, 1.4), (0.76, ws0 - 0.14), (0.0, ws0 - 0.14)], r=0.06, mesh=('h', 0.035),
                        bars=[(1.55 + k * 0.17, 1.55 + k * 0.17 + 0.05, 'darkchrome', 0.04) for k in range(4)], surround=(0.035, 'paint2', 0.02)),
            lower=dict(corners=[(0.0, lo_v0), (0.5, lo_v0), (0.56, 1.33), (0.0, 1.33)], r=0.04, mesh=('grid', 0.04), bars=[]),
            lamps=dict(housing=rpoly([(0.6, lo_v0), (a + 0.2, lo_v0), (a + 0.2, lo_v1 + 0.04), (0.66, lo_v1 + 0.1)], [0.03, 0.06, 0.08, 0.03], 4),
                       proj=[(0.84, lo_v0 + 0.15, 0.055), (0.99, lo_v0 + 0.15, 0.055)],
                       drl=[[(a + 0.16, lo_v0 + 0.03), (a - 0.06, lo_v0 + 0.19), (a + 0.16, lo_v1 + 0.03)]], drlW=0.022,
                       ind=rrect(0.66, 0.74, lo_v0 + 0.05, lo_v0 + 0.2, 0.02)),
            badge=dict(v=ws0 - 0.29, size=0.075, off=0.04, spacing=1.25),
            bumper=dict(lowV=0.62, step=True), visor=True, visorMat='paint', sideIntake=True, intakeBar='paint', doorText=S.get('doorText'),
            dashMat='dash', seatInsert='seat2', extender='paint', skirts=True)
        S['skirts'] = True
    elif d == 'sever':
        st.update(
            upper=dict(u=0.86, v0=ws0 - 0.32, v1=ws0 - 0.05, mat='paint', slot=(ws0 - 0.29, ws0 - 0.24)),
            grille=dict(corners=[(0.0, 1.38), (0.66, 1.38), (0.8, ws0 - 0.38), (0.0, ws0 - 0.38)], r=0.08, mesh=('h', 0.03),
                        bars=[(1.48 + k * 0.17, 1.48 + k * 0.17 + 0.075, 'paint', 0.0) for k in range(3)], surround=(0.03, 'paint', 0.018)),
            lamps=dict(housing=rpoly([(0.5, lo_v0 - 0.02), (a + 0.28, lo_v0 - 0.02), (a + 0.28, lo_v1 - 0.02), (0.5, lo_v1 - 0.02)], [0.04, 0.12, 0.1, 0.04], 4),
                       proj=[(0.74, lo_v0 + 0.13, 0.06), (0.92, lo_v0 + 0.13, 0.06)],
                       drl=[[(0.55, lo_v0 + 0.02), (a + 0.2, lo_v0 + 0.02), (a + 0.24, lo_v1 - 0.07)]], drlW=0.02,
                       ind=rrect(a + 0.05, a + 0.2, lo_v0 + 0.08, lo_v0 + 0.2, 0.03)),
            lower=dict(corners=[(0.0, lo_v0), (0.42, lo_v0), (0.42, 1.3), (0.0, 1.3)], r=0.03, mesh=('h', 0.04), bars=[]),
            badge=dict(v=ws0 - 0.17, size=0.08, off=0.03, spacing=1.6, mat='badge'),
            bumper=dict(lowV=0.6), visor=False, mirrorMat='paint', extender='trim', sideIntake=False, dashMat='dash', seatInsert='seat2')
    elif d == 'titan':
        st.update(
            grille=dict(corners=[(0.0, 1.36), (0.56, 1.36), (0.72, 1.62), (0.84, ws0 - 0.14), (0.0, ws0 - 0.14)], r=0.07, mesh=('h', 0.028),
                        bars=[(ws0 - 0.42, ws0 - 0.36, 'chrome', 0.0, 0.26)], surround=None),
            lamps=dict(housing=rpoly([(0.58, lo_v0), (a + 0.2, lo_v0), (a + 0.2, lo_v1 - 0.04), (0.66, lo_v1 + 0.08)], [0.03, 0.06, 0.07, 0.04], 4),
                       proj=[(0.86, lo_v0 + 0.13, 0.05), (1.0, lo_v0 + 0.13, 0.05)],
                       drl=[[(0.66, lo_v1 + 0.04), (a + 0.12, lo_v1 - 0.06)], [(0.7, lo_v0 + 0.04), (a + 0.12, lo_v0 + 0.04)]], drlW=0.014,
                       ind=rrect(a + 0.07, a + 0.17, lo_v0 + 0.08, lo_v0 + 0.18, 0.02)),
            badge=dict(v=ws0 - 0.39, size=0.07, off=0.05, plate=(0.13, 0.05), plateMat='chrome', mat='trim'),
            lower=dict(corners=[(0.0, lo_v0), (0.48, lo_v0), (0.52, 1.33), (0.0, 1.33)], r=0.03, mesh=('h', 0.03)),
            bumper=dict(lowV=0.64), visor=False, extender='paint', sideIntake=True, intakeBar='grille', dashMat='dash', seatInsert='seat2', noKerb=False)
    elif d == 'ladoga':
        st.update(
            grille=dict(corners=[(0.0, 1.3), (0.5, 1.3), (0.74, ws0 - 0.12), (0.0, ws0 - 0.12)], r=0.05,
                        bars=[(1.36 + k * 0.105, 1.36 + k * 0.105 + 0.05, 'chrome', 0.03) for k in range(9)], surround=(0.03, 'chrome', 0.02)),
            lamps=dict(housing=rpoly([(0.62, lo_v0), (a + 0.12, lo_v0), (a + 0.12, lo_v1 + 0.04), (0.56, lo_v1 + 0.04)], [0.02, 0.04, 0.04, 0.02], 4),
                       reflectors=[(0.7, 0.86, lo_v0 + 0.06, lo_v0 + 0.24), (0.9, 1.06, lo_v0 + 0.06, lo_v0 + 0.24)],
                       drl=[[(0.6, lo_v1 + 0.0), (a + 0.08, lo_v1 + 0.0)]], drlW=0.02,
                       ind=rrect(a + 0.0, a + 0.1, lo_v0 + 0.05, lo_v0 + 0.25, 0.02)),
            badge=dict(v=ws0 - 0.06, size=0.07, off=0.02, spacing=1.2),
            lower=dict(corners=[(0.0, lo_v0), (0.5, lo_v0), (0.5, 1.26), (0.0, 1.26)], r=0.02, mesh=('h', 0.04)),
            bumper=dict(lowV=0.6, step=True), visor=True, visorMat='paint', visorD=0.3, extender='paint', sideIntake=False, dashMat='dash2', dashLower='dash', seatInsert='seat2')
    elif d == 'orion':
        st.update(
            grille=dict(corners=[(0.0, 1.5), (0.8, 1.5), (0.84, ws0 - 0.22), (0.0, ws0 - 0.22)], r=0.09, mesh=('h', 0.03),
                        bars=[(1.6 + k * 0.155, 1.6 + k * 0.155 + 0.06, 'chrome', 0.0, 0.0) for k in range(3)], surround=None),
            lamps=dict(housing=rpoly([(0.54, lo_v0 + 0.06), (a + 0.24, lo_v0 + 0.02), (a + 0.24, lo_v1 + 0.08), (0.6, lo_v1 + 0.16)], [0.04, 0.1, 0.12, 0.06], 4),
                       proj=[(0.8, lo_v0 + 0.19, 0.055), (0.96, lo_v0 + 0.19, 0.055)],
                       drl=[[(0.6, lo_v1 + 0.13), (0.85, lo_v1 + 0.1), (a + 0.1, lo_v1 + 0.04), (a + 0.2, lo_v1 - 0.02)]], drlW=0.02,
                       ind=rrect(a - 0.02, a + 0.14, lo_v0 + 0.08, lo_v0 + 0.16, 0.03)),
            badge=None,
            lower=dict(corners=[(0.0, lo_v0), (0.46, lo_v0), (0.46, 1.42), (0.0, 1.42)], r=0.03, mesh=('h', 0.035), bars=[(1.2, 1.25, 'darkchrome', 0.02)]),
            bumper=dict(lowV=0.62, fogRect=(0.07, 0.035)), visor=False, extender='paint', sideIntake=False, dashMat='dash', seatInsert='seat2')
        st['extras'] = [lambda b, S, F, BM: text_on(b, F, S['badge'], 0.0, S['ws0'] - 0.13, 0.06, 0.02, 'badge', depth=0.01, spacing=1.3)]
    elif d == 'vektor':
        st.update(
            grille=dict(corners=[(0.0, 1.32), (0.5, 1.32), (0.72, 1.56), (0.86, ws0 - 0.1), (0.0, ws0 - 0.1)], r=0.06,
                        bars=[(1.42 + k * 0.13, 1.42 + k * 0.13 + 0.07, 'paint', 0.02) for k in range(6)], surround=(0.035, 'darkchrome', 0.02)),
            lamps=dict(housing=rpoly([(0.56, lo_v0 + 0.02), (a + 0.12, lo_v0 + 0.02), (a + 0.12, lo_v1 + 0.16), (0.74, lo_v1 + 0.06)], [0.03, 0.04, 0.06, 0.03], 4),
                       proj=[(0.86, lo_v0 + 0.15, 0.05), (1.0, lo_v0 + 0.15, 0.05)],
                       drl=[[(0.66, lo_v0 + 0.06), (0.62, lo_v0 + 0.2), (0.76, lo_v1 + 0.04), (a + 0.08, lo_v1 + 0.1)]], drlW=0.018,
                       ind=rrect(a - 0.02, a + 0.08, lo_v0 + 0.05, lo_v0 + 0.15, 0.02)),
            badge=dict(v=ws0 - 0.24, size=0.07, off=0.04, plate=(0.22, 0.06), plateMat='paint2', mat='badge'),
            lower=dict(corners=[(0.0, lo_v0), (0.46, lo_v0), (0.46, 1.27), (0.0, 1.27)], r=0.02, mesh=('grid', 0.035)),
            bumper=dict(lowV=0.64), visor=False, extender='paint', dashMat='dash', seatInsert='seat2')
    elif d == 'vega':
        st.update(
            grille=dict(corners=[(0.0, 1.36), (0.52, 1.36), (0.8, 1.7), (0.8, ws0 - 0.2), (0.0, ws0 - 0.2)], r=0.06, mesh=('honey', 0.045), back='grille',
                        bars=[(ws0 - 0.42, ws0 - 0.36, 'chrome', 0.04, 0.3)], surround=(0.03, 'paint2', 0.02)),
            lamps=dict(housing=rpoly([(0.5, lo_v0 + 0.12), (0.62, lo_v0), (a + 0.2, lo_v0), (a + 0.2, lo_v1 - 0.02), (0.82, lo_v1 + 0.1)], [0.02, 0.03, 0.05, 0.06, 0.02], 4),
                       proj=[(0.88, lo_v0 + 0.12, 0.05), (1.02, lo_v0 + 0.12, 0.05)],
                       drl=[[(0.56, lo_v0 + 0.13), (0.82, lo_v1 + 0.05), (a + 0.16, lo_v1 - 0.06)]], drlW=0.016,
                       ind=rpoly([(0.6, lo_v0 + 0.03), (0.72, lo_v0 + 0.03), (0.72, lo_v0 + 0.1), (0.58, lo_v0 + 0.1)], 0.01, 2)),
            badge=dict(v=ws0 - 0.12, size=0.07, off=0.02, spacing=1.3),
            lower=dict(corners=[(0.0, lo_v0), (0.44, lo_v0), (0.44, 1.3), (0.0, 1.3)], r=0.02, mesh=('honey', 0.04)),
            bumper=dict(lowV=0.62), visor=False, extender='paint', dashMat='dash', seatInsert='seat2')
    elif d == 'buran':
        st.update(
            grille=dict(corners=[(0.0, 1.34), (0.62, 1.34), (0.82, 1.5), (0.84, ws0 - 0.12), (0.0, ws0 - 0.12)], r=0.03, mesh=('h', 0.03),
                        bars=[(1.48 + k * 0.2, 1.48 + k * 0.2 + 0.09, 'grille', 0.0) for k in range(3)], surround=(0.03, 'plastic', 0.02)),
            lamps=dict(housing=rpoly([(0.64, lo_v0), (a + 0.16, lo_v0), (a + 0.16, lo_v1 - 0.02), (0.84, lo_v1 + 0.06), (0.64, lo_v1 + 0.06)], [0.02, 0.03, 0.04, 0.02, 0.02], 4),
                       proj=[(0.82, lo_v0 + 0.14, 0.05), (0.96, lo_v0 + 0.14, 0.05)],
                       drl=[[(0.68, lo_v1 + 0.02), (0.86, lo_v1 + 0.02), (a + 0.12, lo_v1 - 0.06)]], drlW=0.016,
                       ind=rrect(a + 0.02, a + 0.12, lo_v0 + 0.04, lo_v0 + 0.14, 0.01)),
            badge=dict(v=ws0 - 0.24, size=0.1, off=0.05, spacing=1.15, mat='paint'),
            lower=dict(corners=[(0.0, lo_v0), (0.56, lo_v0), (0.56, 1.3), (0.0, 1.3)], r=0.02, mesh=('h', 0.04)),
            bumper=dict(lowV=0.62, lowMat='plastic'), visor=False, extender='trim', dashMat='dash', seatInsert='seat2')
    elif d == 'taiga':
        S['bumperOut'] = 0.12
        st.update(
            grille=dict(corners=[(0.0, 1.36), (0.82, 1.36), (0.82, ws0 - 0.14), (0.0, ws0 - 0.14)], r=0.03,
                        bars=[(1.42 + k * 0.12, 1.42 + k * 0.12 + 0.07, 'grille', 0.02) for k in range(6)], back='plastic', surround=(0.04, 'paint', 0.015)),
            lamps=dict(onBumper=True, housing=rpoly([(0.56, 0.7), (1.04, 0.7), (1.04, 0.86), (0.56, 0.86)], 0.02, 3),
                       reflectors=[(0.6, 0.82, 0.72, 0.84), (0.86, 1.0, 0.72, 0.84)], drl=[], ind=None),
            badge=dict(v=ws0 - 0.08, size=0.08, off=0.02, spacing=1.2),
            lower=None,
            bumper=dict(lowV=0.58, intake=(0.6, 0.68), intakeU=0.45, plateV=0.78, fogU=0.88, fogV=0.52, fogR=0.05), visor=True, visorMat='paint',
            visorD=0.18, extender=None, dashMat='dash2', dashLower='dash', auto=False, seatInsert='seat', flatFloor=False)
        st['extras'] = [lambda b, S, F, BM: [shape(b, BM, rrect(s * 1.0 - 0.07, s * 1.0 + 0.07, 0.72, 0.84, 0.02), 0.025, 'ind_L' if s > 0 else 'ind_R') for s in (1, -1)]]
    elif d == 'neman':
        S['bumperOut'] = 0.12
        st.update(
            grille=dict(corners=[(0.0, 1.3), (0.78, 1.3), (0.82, ws0 - 0.16), (0.0, ws0 - 0.16)], r=0.1,
                        bars=[(1.36 + k * 0.1, 1.36 + k * 0.1 + 0.05, 'paint2', 0.03) for k in range(8)], back='grille', surround=(0.035, 'paint2', 0.02)),
            lamps=dict(onBumper=True, housing=rpoly([(0.54, 0.68), (1.06, 0.68), (1.06, 0.86), (0.54, 0.86)], 0.04, 3),
                       proj=[(0.68, 0.77, 0.06), (0.86, 0.77, 0.06)], drl=[[(0.6, 0.71), (1.0, 0.71)]], drlW=0.012, ind=rrect(0.97, 1.03, 0.73, 0.83, 0.01)),
            badge=dict(v=ws0 - 0.08, size=0.08, off=0.02, spacing=1.25),
            lower=None,
            bumper=dict(lowV=0.56, intake=(0.58, 0.66), intakeU=0.42, plateV=0.76, fogU=0.86, fogV=0.5, fogR=0.05), visor=True, visorMat='paint',
            visorD=0.2, extender=None, dashMat='dash2', dashLower='dash', auto=False, seatInsert='seat2', mirrorMat='trim')
    elif d == 'enisey':
        st.update(
            grille=dict(corners=[(0.0, 1.36), (0.58, 1.36), (0.74, 1.6), (0.84, ws0 - 0.14), (0.0, ws0 - 0.14)], r=0.07,
                        bars=[(1.42 + k * 0.12, 1.42 + k * 0.12 + 0.05, 'chrome', 0.03) for k in range(7)], surround=(0.035, 'chrome', 0.022)),
            lamps=dict(housing=rpoly([(0.6, lo_v0), (a + 0.2, lo_v0), (a + 0.2, lo_v1 - 0.03), (0.68, lo_v1 + 0.07)], [0.03, 0.06, 0.07, 0.04], 4),
                       proj=[(0.86, lo_v0 + 0.13, 0.05), (1.0, lo_v0 + 0.13, 0.05)],
                       drl=[[(0.66, lo_v1 + 0.03), (a + 0.12, lo_v1 - 0.07)]], drlW=0.018,
                       ind=rrect(a + 0.07, a + 0.17, lo_v0 + 0.08, lo_v0 + 0.18, 0.02)),
            badge=dict(v=ws0 - 0.08, size=0.07, off=0.02, spacing=1.3),
            lower=dict(corners=[(0.0, lo_v0), (0.5, lo_v0), (0.54, 1.33), (0.0, 1.33)], r=0.03, mesh=('h', 0.03)),
            bumper=dict(lowV=0.64), visor=True, visorMat='paint', extender='paint', sideIntake=True, intakeBar='chrome', dashMat='dash', seatInsert='seat2')
    elif d == 'polyus':
        st.update(
            grille=dict(corners=[(0.0, 1.32), (0.66, 1.32), (0.82, 1.55), (0.82, ws0 - 0.14), (0.0, ws0 - 0.14)], r=0.05,
                        vbars=[(13, 'chrome', 0.42)], surround=(0.04, 'chrome', 0.022), mesh=('h', 0.05)),
            lamps=dict(housing=rpoly([(0.66, lo_v0), (a + 0.22, lo_v0), (a + 0.22, lo_v1 + 0.04), (0.84, lo_v1 + 0.06)], [0.03, 0.06, 0.08, 0.03], 4),
                       proj=[(0.88, lo_v0 + 0.16, 0.055), (1.03, lo_v0 + 0.16, 0.055)],
                       drl=[[(0.7, lo_v0 + 0.04), (a + 0.16, lo_v0 + 0.04)], [(0.72, lo_v0 + 0.06), (0.86, lo_v1 + 0.02)]], drlW=0.016,
                       ind=rrect(a + 0.08, a + 0.18, lo_v0 + 0.1, lo_v1, 0.02)),
            badge=dict(v=ws0 - 0.08, size=0.075, off=0.02, spacing=1.3),
            lower=dict(corners=[(0.0, lo_v0), (0.6, lo_v0), (0.6, 1.28), (0.0, 1.28)], r=0.02, mesh=('h', 0.03)),
            bumper=dict(lowV=0.64), visor=True, visorMat='paint2', extender='paint', sideIntake=False, dashMat='dash', seatInsert='seat2')
    st['doorText'] = st.get('doorText') or None
    S['style'] = st
    if st.get('flatFloor') is None:
        S['flatFloor'] = S['roof'] in ('xl',)
    return S


# ---------- assembly ----------
LO_ROLE = {'paint': 'paint', 'paint2': 'trim', 'trim': 'trim', 'plastic': 'plastic', 'grille': 'grille', 'chrome': 'chrome', 'darkchrome': 'chrome',
           'frit': 'trim', 'rubber': 'tyre', 'glass': 'glass', 'lens': 'glass', 'head': 'head', 'drl': 'head', 'tail': 'tail', 'ind_L': 'amber',
           'ind_R': 'amber', 'marker': 'marker', 'reverse': 'white', 'steel': 'under', 'alu': 'alu', 'tyre': 'tyre', 'rim': 'rim', 'rimdark': 'rimdark',
           'mirror_glass': 'chrome', 'badge': 'chrome', 'seam': 'seam', 'plate': 'plate', 'ink': 'seam', 'airRed': 'plastic', 'airYellow': 'plastic',
           'adblue': 'blue'}


def join_objs(name, objs):
    bm = bmesh.new()
    for o in objs:
        me = o.data.copy()
        me.transform(o.matrix_world)
        bm.from_mesh(me)
        bpy.data.meshes.remove(me)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    for n in MLIST:
        me.materials.append(MATS[n])
    for o in objs:
        bpy.data.objects.remove(o)
    o = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(o)
    return o


def tris(o):
    return sum(len(p.vertices) - 2 for p in o.data.polygons)


def build_truck(tid, S, lod=False):
    eye = S['eye']
    made = []
    six = S['axles'] == '6x4'
    levels = cab_levels(S)
    F = Surf(levels)
    S['cabSurf'] = F
    # bumper surface: wraps the lower corners and runs back to the wheel arch
    yb0, yb1 = S['bumperY']
    bo = S['bumperOut']
    bl = []
    for y, k in ((yb0, 0.06), (yb0 + 0.05, 0.02), (yb0 + 0.18, 0.0), ((yb0 + yb1) / 2, 0.0), (yb1 - 0.08, 0.005), (yb1, 0.03)):
        bl.append((y, S['w'] + 0.01 - k * 0.5, S['zf'] + bo - k, S['rf'] + 0.1))
    BM = Surf(bl)
    # cab shell with the windows, arch cut-out and the area behind the arch raised to the cab floor
    shell = cab_shell(S).obj(tid + '_shell', sharp=0.7)
    cutter, Ra = arch_cutter(S)
    boolean_cut(shell, cutter)
    cb2 = Buf()
    zcut0 = S['wb'] - math.sqrt(max(0.0, Ra ** 2 - (S['yb'] - S['R']) ** 2))
    box(cb2, (0, S['yb'] - 1.0, (zcut0 + S['zr'] - 1.0) / 2), (4.0, 2.0, zcut0 - S['zr'] + 1.0), 'trim')
    boolean_cut(shell, cb2)
    parts = [shell]
    d = Buf()
    # bumper shell
    ring_ids = []
    zs_side = [S['zf'] - 0.3, S['zf'] - 0.45]
    for (y, W, Fz, r) in bl:
        zb = S['wb'] + math.sqrt(max(0.0, (Ra + 0.02) ** 2 - (y - S['R']) ** 2)) + 0.02
        pts, *_ = rr_points(W, Fz, zb, r, 0.02, [0.0, 0.25, 0.5, 0.75, W - r - 0.01], [z for z in zs_side if z > zb + 0.05] + [zb + 0.03])
        ring_ids.append([d.add((x, y, z)) for x, z in pts])
    nb = len(ring_ids[0])
    bmat = S['style'].get('bumperMat', 'paint')
    for i in range(len(ring_ids) - 1):
        for j in range(nb):
            j2 = (j + 1) % nb
            d.face_out([ring_ids[i][j], ring_ids[i][j2], ring_ids[i + 1][j2], ring_ids[i + 1][j]], bmat, (0, (bl[i][0] + bl[i + 1][0]) / 2, S['wb'] + 0.8), True)
    for ring, y, sgn in ((ring_ids[0], yb0, -1), (ring_ids[-1], yb1, 1)):
        c = d.add((0, y, S['zf'] - 0.4))
        for j in range(nb):
            d.face_out([c, ring[j], ring[(j + 1) % nb]], 'trim', (0, y - sgn, S['zf'] - 0.4))
    # underside of the cab behind the arch
    box(d, (0, S['yb'] + 0.01, (zcut0 + S['zr']) / 2), (2 * S['w'] - 0.06, 0.02, zcut0 - S['zr'] - 0.04), 'trim')
    # windscreen ceramic band and rubber
    xw = S['xw']
    ws0, ws1 = S['ws0'], S['ws1']
    outer = rrect(-xw - 0.03, xw + 0.03, ws0 - 0.03, ws1 + 0.03, 0.0)
    inner = rrect(-xw + 0.05, xw - 0.05, ws0 + 0.05, ws1 - 0.1, 0.1)
    frame(d, F, outer, inner, 0.006, 'frit', back=True)
    frame(d, F, rrect(-xw - 0.05, xw + 0.05, ws0 - 0.05, ws1 + 0.05, 0.0), outer, 0.004, 'rubber', back=True)
    standard_face(d, S, F, BM)
    steps_and_fenders(d, S, F)
    cab_side(d, S, F)
    roof_bits(d, S, F)
    cab_rear(d, S)
    chassis(d, S)
    mir = mirrors(d, S, eye)
    lw = Buf()
    if lod:
        # traffic copies: simple wheels in the body (the traffic draws whole vehicles as instances)
        d0 = d
        d = lw
        for sx in (1, -1):
            for z, dual in [(S['wb'], False)] + ([(0.675, True), (-0.675, True)] if six else [(0.0, True)]):
                tw = 0.3 if dual else 0.38
                xs = [sx * (1.04 - tw / 2 - 0.015), sx * (1.04 - tw * 1.5 - 0.045)] if dual else [sx * (S['w'] - 0.06 - tw / 2 + 0.02)]
                for k, xc in enumerate(xs):
                    R = S['R']
                    lathe(d, (xc, R, z), 'x', [(0.29, -tw / 2), (R - 0.03, -tw / 2), (R, -tw / 2 + 0.05), (R, tw / 2 - 0.05), (R - 0.03, tw / 2), (0.29, tw / 2)], 14, 'tyre', True)
                    if k == 0:
                        lathe(d, (xc, R, z), 'x', [(0.29, sx * tw / 2), (0.12, sx * (tw / 2 - 0.06)), (0.0, sx * (tw / 2 - 0.04))], 14, 'rim', True, ref=Vector((xc - sx, R, z)))
                    lathe(d, (xc, R, z), 'x', [(0.29, -sx * tw / 2), (0.0, -sx * (tw / 2 - 0.05))], 10, 'rimdark', False, ref=Vector((xc + sx, R, z)))
        d = d0
    parts.append(d.obj(tid + '_detail', sharp=0.7))
    body = join_objs(tid, parts)
    made.append(body)
    if lod:
        made.append(lw.obj(tid + '_lowheels', sharp=0.9))
    gauges = None
    if not lod:
        ib = Buf()
        gauges = interior(ib, S, eye)
        inner_shell = cab_shell(S, inner=0.06).obj(tid + '_inner', sharp=0.7)
        io = join_objs('interior', [inner_shell, ib.obj('interior_parts', sharp=0.7)])
        made.append(io)
    # wheels
    R = S['R']
    wheels = [('wheel_FL', 1, S['wb'], False), ('wheel_FR', -1, S['wb'], False)]
    if six:
        wheels += [('wheel_ML', 1, 0.675, True), ('wheel_MR', -1, 0.675, True), ('wheel_RL', 1, -0.675, True), ('wheel_RR', -1, -0.675, True)]
    else:
        wheels += [('wheel_RL', 1, 0.0, True), ('wheel_RR', -1, 0.0, True)]
    wheel_list = []
    for name, sx, z, dual in (wheels if not lod else []):
        tw = 0.3 if dual else 0.38
        xc = sx * (1.04 - (tw / 2 + 0.015 if dual else 0.0)) if dual else sx * (S['w'] - 0.06 - tw / 2 + 0.02)
        o = wheel_obj(name if not lod else tid + '_' + name, R, tw, 0.285, sx, S['style'].get('rims', 'alu'), dual)
        o.location = V((xc, R, z))
        made.append(o)
        wheel_list.append([round(xc, 3), R, z, 1 if not dual else 0, name])
    extras = {}
    if not lod:
        sw = steering_wheel(S).obj('steering', sharp=1.2)
        a = S['wheelTilt']
        axis = Vector((0, math.sin(a), -math.cos(a)))
        me = sw.data
        rot = axis.to_track_quat('Z', 'Y')
        for v in me.vertices:
            v.co = V(rot @ G(v.co))
        sw.location = V(S['wheelC'])
        made.append(sw)
        extras['steerAxis'] = [round(axis.x, 4), round(axis.y, 4), round(axis.z, 4)]
        go = gauges.obj('gauges', sharp=0)
        made.append(go)
        for name, (g, mc, n, right, upv, hw, hh) in mir.items():
            o = g.obj(name, sharp=0)
            made.append(o)
            r3 = lambda v: [round(v.x, 4), round(v.y, 4), round(v.z, 4)]
            extras[name] = {'centre': r3(mc), 'normal': r3(n), 'right': r3(right), 'up': r3(upv), 'hw': round(hw, 4), 'hh': round(hh, 4)}
    spec = {'id': tid, 'name': S['name'], 'axles': S['axles'], 'wheelbase': S['wb'], 'cabFront': round(S['zf'] + S['bumperOut'], 3), 'cabRear': S['zr'],
            'top': S['top'], 'king': S['king'], 'length': round(S['zf'] + S['bumperOut'] - S['zEnd'], 3), 'rear': S['zEnd'], 'R': R,
            'eye': [round(x, 3) for x in eye], 'lampY': round(S['yfb'] + 0.2, 3), 'wheels': wheel_list,
            'wheelC': [round(x, 3) for x in S['wheelC']], 'mirrorEye': [round(x, 3) for x in eye], **extras}
    body['truck'] = json.dumps(spec)
    return made, spec


def lo_materials(objs):
    """Rename to the traffic material roles (car_*) so the traffic merger understands them."""
    for o in objs:
        me = o.data
        for i, m in enumerate(list(me.materials)):
            n = m.name[4:] if m and m.name.startswith('MAT-') else 'plastic'
            role = LO_ROLE.get(n, 'plastic')
            me.materials[i] = bpy.data.materials.get('car_' + role) or bpy.data.materials.new('car_' + role)


def setup_preview():
    sc = bpy.context.scene
    if 'ground' in bpy.data.objects:
        return
    g = bpy.data.objects.new('ground', bpy.data.meshes.new('ground'))
    g.data.from_pydata([(-60, -60, 0), (60, -60, 0), (60, 60, 0), (-60, 60, 0)], [], [(0, 1, 2, 3)])
    gm = bpy.data.materials.new('groundmat')
    gm.use_nodes = True
    gm.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (0.1, 0.1, 0.1, 1)
    g.data.materials.append(gm)
    sc.collection.objects.link(g)
    sun = bpy.data.objects.new('sun', bpy.data.lights.new('sun', 'SUN'))
    sun.data.energy = 4
    sun.data.angle = math.radians(2)
    sun.rotation_euler = (math.radians(50), 0, math.radians(35))
    sc.collection.objects.link(sun)
    w = bpy.data.worlds.new('w')
    sc.world = w
    w.use_nodes = True
    sky = w.node_tree.nodes.new('ShaderNodeTexSky')
    w.node_tree.links.new(sky.outputs[0], w.node_tree.nodes['Background'].inputs[0])
    w.node_tree.nodes['Background'].inputs[1].default_value = 0.35
    lamp = bpy.data.objects.new('cablight', bpy.data.lights.new('cablight', 'AREA'))
    lamp.data.energy = 60
    lamp.data.size = 1.2
    sc.collection.objects.link(lamp)
    sc.render.engine = 'CYCLES'
    sc.cycles.samples = 24
    sc.cycles.device = 'CPU'
    sc.view_settings.view_transform = 'AgX'


def preview(objs, spec, path):
    setup_preview()
    sc = bpy.context.scene
    for o in sc.objects:
        o.hide_render = o.type == 'MESH' and o not in objs and o.name != 'ground'
    paint = MATS['paint'].node_tree.nodes['Principled BSDF']
    cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam'))
    sc.collection.objects.link(cam)
    sc.camera = cam
    cf, rear, top = spec['cabFront'], spec['rear'], spec['top']
    lamp = bpy.data.objects['cablight']
    lamp.location = V((0.2, top - 0.25, spec['eye'][2] + 0.2))
    lamp.rotation_euler = (0, 0, 0)
    mid = (cf + rear) / 2
    e = spec['eye']
    shots = {
        'front34': ((5.2, 2.4, cf + 6.8), (0, 1.8, cf - 1.6), 38),
        'face': ((0.0, 1.9, cf + 6.0), (0, 1.9, cf), 38),
        'side': ((-11.5, 2.0, mid), (0, 1.75, mid), 38),
        'rear34': ((-6.0, 3.4, rear - 6.0), (0, 1.5, mid), 38),
        'top': ((0.01, 16.0, mid), (0, 0, mid), 34),
        'under': ((4.5, 0.25, cf + 2.0), (0, 0.7, mid), 26),
        'cab': (tuple(e), (e[0] - 0.05, e[1] - 0.42, e[2] + 3.0), 18),
        'cabL': (tuple(e), (e[0] + 3.0, e[1] - 0.5, e[2] + 1.6), 18),
        'cabR': (tuple(e), (e[0] - 3.0, e[1] - 0.5, e[2] + 1.6), 18),
        'dash': ((e[0] - 0.1, e[1] - 0.05, e[2] + 0.1), (e[0], e[1] - 0.45, e[2] + 1.2), 24),
        'mirror': ((spec['mirror_L']['centre'][0] + 1.2, spec['mirror_L']['centre'][1] + 0.3, cf + 1.6) if 'mirror_L' in spec else (3, 3, cf + 2), tuple(spec['mirror_L']['centre']) if 'mirror_L' in spec else (1.5, 3, cf), 40),
        'rear': ((0.0, 2.2, rear - 7.0), (0, 1.4, rear), 40),
        'thumb': ((6.4, 2.3, cf + 5.6), (0.2, 1.75, (cf + rear) / 2 + 0.6), 36),
    }
    sc.render.resolution_x = 960
    sc.render.resolution_y = 600
    if CULL and not getattr(preview, 'culled', False):
        # what the game shows: back faces are not drawn (transparent in Cycles)
        preview.culled = True
        for m in MATS.values():
            nt = m.node_tree
            out = nt.nodes['Material Output']
            bsdf = nt.nodes['Principled BSDF']
            geo = nt.nodes.new('ShaderNodeNewGeometry')
            tr = nt.nodes.new('ShaderNodeBsdfTransparent')
            mix = nt.nodes.new('ShaderNodeMixShader')
            nt.links.new(geo.outputs['Backfacing'], mix.inputs[0])
            nt.links.new(bsdf.outputs[0], mix.inputs[1])
            nt.links.new(tr.outputs[0], mix.inputs[2])
            nt.links.new(mix.outputs[0], out.inputs['Surface'])
    files = []
    names = VIEWS or ['front34', 'face', 'side', 'rear34', 'cab']
    for name in names:
        p, t, lens = shots[name]
        cam.location = V(p)
        cam.rotation_euler = (V(t) - V(p)).to_track_quat('-Z', 'Y').to_euler()
        cam.data.lens = lens
        cam.data.clip_start = 0.03
        f = path.replace('.png', '-%s-%s.png' % (spec['id'], name))
        sc.render.film_transparent = name == 'thumb'
        ground = bpy.data.objects.get('ground')
        if ground:
            ground.hide_render = name == 'thumb'
        if name == 'thumb':
            sc.render.resolution_x, sc.render.resolution_y = 640, 360
        else:
            sc.render.resolution_x, sc.render.resolution_y = 960, 600
        sc.render.filepath = f
        bpy.ops.render.render(write_still=True)
        files.append(f)
    bpy.data.objects.remove(cam)
    return files


def export(objs, path):
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs:
        o.select_set(True)
    bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', use_selection=True, export_extras=True, export_yup=True,
                              export_texcoords=True, export_normals=True, export_materials='EXPORT', export_cameras=False, export_lights=False)


PAINTS = {'atlant': (0.55, 0.06, 0.05), 'sever': (0.8, 0.8, 0.8), 'titan': (0.05, 0.12, 0.3), 'ladoga': (0.85, 0.85, 0.85), 'orion': (0.08, 0.08, 0.09),
          'vektor': (0.75, 0.32, 0.03), 'vega': (0.12, 0.25, 0.45), 'buran': (0.06, 0.2, 0.42), 'taiga': (0.82, 0.82, 0.8), 'neman': (0.1, 0.32, 0.18),
          'enisey': (0.6, 0.6, 0.62), 'polyus': (0.55, 0.42, 0.08)}

if __name__ == '__main__':
    t0 = time.time()
    lo_objs = []
    for tid, kw in TRUCKS.items():
        if ONLY and tid not in ONLY:
            continue
        S = design(base_spec(**kw))
        objs, spec = build_truck(tid, S)
        print(tid, 'tris', sum(tris(o) for o in objs), 'interior', sum(tris(o) for o in objs if o.name == 'interior'))
        if PREVIEW:
            MATS['paint'].node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (*PAINTS.get(tid, (0.8, 0.8, 0.8)), 1)
            preview(objs, spec, PREVIEW)
        export(objs, os.path.join(OUT, tid + '.glb'))
        for o in objs:
            bpy.data.objects.remove(o)
        if LO:
            lo, _ = build_truck(tid, S, lod=True)
            body = lo[0]
            dec = body.modifiers.new('dec', 'DECIMATE')
            dec.ratio = min(1.0, 4600 / max(1, tris(body)))
            dg = bpy.context.evaluated_depsgraph_get()
            me = bpy.data.meshes.new_from_object(body.evaluated_get(dg))
            body.modifiers.clear()
            body.data = me
            body = join_objs(tid, lo)
            body['vehicle'] = json.dumps({'len': spec['length'], 'wid': 2.5, 'h': spec['top'], 'wheel': '', 'r': spec['R'], 'wheels': spec['wheels'],
                                          'beacon': 0, 'kingpin': spec['king'], 'front': spec['cabFront'], 'wheelbase': spec['wheelbase'], 'rear': spec['rear']})
            lo_objs.append(body)
            print(tid, 'lo tris', tris(body))
    if LO and lo_objs:
        lo_materials(lo_objs)
        export(lo_objs, os.path.join(OUT, 'trucks-lo.glb'))
    print('done in', round(time.time() - t0, 1), 's')
