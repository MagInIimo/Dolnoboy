# Renders facade tiles (4 bays x 4 floors) from real 3D geometry with Cycles:
#   python facades.py <out_dir> [only=name,name]
# For each type it writes <name>_col.png (albedo x ambient occlusion), <name>_nrm.png (tangent-space normal)
# and <name>_msk.png (glass mask). Elements around the tile are built too, so lighting tiles seamlessly.
import os, sys, math, time, zlib, struct, bpy, bmesh
import numpy as np
from mathutils import Vector

OUT = next((a for a in sys.argv[1:] if not a.startswith('only=') and not a.endswith('.py')), 'facades')
ONLY = next((a.split('=')[1].split(',') for a in sys.argv if a.startswith('only=')), None)
RES = 512
os.makedirs(OUT, exist_ok=True)


def write_png(path, arr):
    """arr: HxWxC uint8, row 0 = top."""
    h, w, c = arr.shape
    kind = {1: 0, 3: 2, 4: 6}[c]
    raw = b''.join(b'\x00' + arr[y].tobytes() for y in range(h))
    def chunk(t, d):
        return struct.pack('>I', len(d)) + t + d + struct.pack('>I', zlib.crc32(t + d) & 0xffffffff)
    png = b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, kind, 0, 0, 0)) + chunk(b'IDAT', zlib.compress(raw, 9)) + chunk(b'IEND', b'')
    with open(path, 'wb') as f:
        f.write(png)


def srgb(x):
    x = np.clip(x, 0, 1)
    return np.where(x <= 0.0031308, 12.92 * x, 1.055 * np.power(x, 1 / 2.4) - 0.055)


# ---------- scene helpers ----------
def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    sc.render.engine = 'CYCLES'
    sc.cycles.device = 'CPU'
    sc.cycles.samples = 48
    sc.cycles.use_denoising = True
    sc.render.resolution_x = RES
    sc.render.resolution_y = RES
    sc.render.film_transparent = False
    sc.view_settings.view_transform = 'Standard'
    w = bpy.data.worlds.new('w')
    sc.world = w
    w.use_nodes = True
    w.node_tree.nodes['Background'].inputs[0].default_value = (1, 1, 1, 1)
    w.node_tree.nodes['Background'].inputs[1].default_value = 1.0
    w.light_settings.distance = 0.7
    vl = sc.view_layers[0]
    vl.use_pass_diffuse_color = True
    vl.use_pass_ambient_occlusion = True
    vl.use_pass_normal = True
    vl.use_pass_z = True
    return sc


MAT = {}


def mat(name, rgb, rough=0.8, nodes=None):
    """Principled material; `nodes(nt, bsdf)` may add procedural colour/bump."""
    if name in MAT:
        return MAT[name]
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    b = nt.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = (*rgb, 1)
    b.inputs['Roughness'].default_value = rough
    if nodes:
        nodes(nt, b)
    MAT[name] = m
    return m


class Mesh:
    def __init__(self):
        self.v, self.f, self.m, self.names = [], [], [], []

    def box(self, x0, x1, y0, y1, z0, z1, mname):
        if mname not in self.names:
            self.names.append(mname)
        k = self.names.index(mname)
        b = len(self.v)
        for x in (x0, x1):
            for y in (y0, y1):
                for z in (z0, z1):
                    self.v.append((x, y, z))
        for q in ((0, 1, 3, 2), (4, 6, 7, 5), (0, 4, 5, 1), (2, 3, 7, 6), (0, 2, 6, 4), (1, 5, 7, 3)):
            self.f.append([b + i for i in q])
            self.m.append(k)

    def obj(self, name):
        me = bpy.data.meshes.new(name)
        me.from_pydata(self.v, [], self.f)
        for n in self.names:
            me.materials.append(MAT[n])
        for p, k in zip(me.polygons, self.m):
            p.material_index = k
        bm = bmesh.new()
        bm.from_mesh(me)
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        bm.to_mesh(me)
        bm.free()
        o = bpy.data.objects.new(name, me)
        bpy.context.scene.collection.objects.link(o)
        return o


def bake_mods(o):
    dg = bpy.context.evaluated_depsgraph_get()
    me = bpy.data.meshes.new_from_object(o.evaluated_get(dg))
    o.modifiers.clear()
    o.data = me


# tileable noise: a 4D torus mapping of the tile area
def torus_noise(nt, W, H, scale, detail=4, stretch=(1, 1)):
    tc = nt.nodes.new('ShaderNodeTexCoord')
    sep = nt.nodes.new('ShaderNodeSeparateXYZ')
    nt.links.new(tc.outputs['Object'], sep.inputs[0])
    def ang(sock, period):
        m = nt.nodes.new('ShaderNodeMath')
        m.operation = 'MULTIPLY'
        m.inputs[1].default_value = 2 * math.pi / period
        nt.links.new(sock, m.inputs[0])
        return m.outputs[0]
    def trig(sock, op, r):
        t = nt.nodes.new('ShaderNodeMath')
        t.operation = op
        nt.links.new(sock, t.inputs[0])
        s = nt.nodes.new('ShaderNodeMath')
        s.operation = 'MULTIPLY'
        s.inputs[1].default_value = r
        nt.links.new(t.outputs[0], s.inputs[0])
        return s.outputs[0]
    ax = ang(sep.outputs['X'], W)
    az = ang(sep.outputs['Z'], H)
    rx = scale * W / (2 * math.pi) / stretch[0]
    rz = scale * H / (2 * math.pi) / stretch[1]
    comb = nt.nodes.new('ShaderNodeCombineXYZ')
    nt.links.new(trig(ax, 'COSINE', rx), comb.inputs[0])
    nt.links.new(trig(ax, 'SINE', rx), comb.inputs[1])
    nt.links.new(trig(az, 'COSINE', rz), comb.inputs[2])
    n = nt.nodes.new('ShaderNodeTexNoise')
    n.noise_dimensions = '4D'
    n.inputs['Detail'].default_value = detail
    n.inputs['Scale'].default_value = 1.0
    nt.links.new(comb.outputs[0], n.inputs['Vector'])
    nt.links.new(trig(az, 'SINE', rz), n.inputs['W'])
    return n.outputs['Fac']


def cell_noise(nt, bay, floor):
    """Random value per facade cell (panel), constant inside the cell."""
    tc = nt.nodes.new('ShaderNodeTexCoord')
    mp = nt.nodes.new('ShaderNodeMapping')
    mp.inputs['Scale'].default_value = (1 / bay, 1, 1 / floor)
    nt.links.new(tc.outputs['Object'], mp.inputs[0])
    fl = nt.nodes.new('ShaderNodeVectorMath')
    fl.operation = 'FLOOR'
    nt.links.new(mp.outputs[0], fl.inputs[0])
    wn = nt.nodes.new('ShaderNodeTexWhiteNoise')
    wn.noise_dimensions = '3D'
    nt.links.new(fl.outputs[0], wn.inputs['Vector'])
    return wn.outputs['Value']


def wall_material(name, base, W, H, bay, floor, kind='plaster', var=0.06, dirt=0.12, brick=None, mortar=None):
    def build(nt, b):
        col = nt.nodes.new('ShaderNodeRGB')
        col.outputs[0].default_value = (*base, 1)
        out = col.outputs[0]
        if kind == 'brick':
            br = nt.nodes.new('ShaderNodeTexBrick')
            tc = nt.nodes.new('ShaderNodeTexCoord')
            mp = nt.nodes.new('ShaderNodeMapping')
            # brick texture runs in its XY plane: feed (x, z)
            sep = nt.nodes.new('ShaderNodeSeparateXYZ')
            nt.links.new(tc.outputs['Object'], sep.inputs[0])
            comb = nt.nodes.new('ShaderNodeCombineXYZ')
            nt.links.new(sep.outputs['X'], comb.inputs[0])
            nt.links.new(sep.outputs['Z'], comb.inputs[1])
            br.offset = 0.5
            br.offset_frequency = 2
            br.squash = 1.0
            br.inputs['Scale'].default_value = 1.0
            bw, bh = brick
            br.inputs['Brick Width'].default_value = bw
            br.inputs['Row Height'].default_value = bh
            br.inputs['Mortar Size'].default_value = 0.011
            br.inputs['Mortar Smooth'].default_value = 0.1
            br.inputs['Bias'].default_value = 0.0
            br.inputs['Color1'].default_value = (*base, 1)
            br.inputs['Color2'].default_value = (*[c * 0.82 for c in base], 1)
            br.inputs['Mortar'].default_value = (*(mortar or (0.55, 0.53, 0.5)), 1)
            nt.links.new(comb.outputs[0], br.inputs['Vector'])
            out = br.outputs['Color']
            bump = nt.nodes.new('ShaderNodeBump')
            bump.inputs['Strength'].default_value = 0.6
            bump.inputs['Distance'].default_value = 0.01
            inv = nt.nodes.new('ShaderNodeMath')
            inv.operation = 'SUBTRACT'
            inv.inputs[0].default_value = 1.0
            nt.links.new(br.outputs['Fac'], inv.inputs[1])
            nt.links.new(inv.outputs[0], bump.inputs['Height'])
            nt.links.new(bump.outputs[0], b.inputs['Normal'])
        elif kind == 'tile':
            # small ceramic mosaic on panels
            br = nt.nodes.new('ShaderNodeTexBrick')
            tc = nt.nodes.new('ShaderNodeTexCoord')
            sep = nt.nodes.new('ShaderNodeSeparateXYZ')
            nt.links.new(tc.outputs['Object'], sep.inputs[0])
            comb = nt.nodes.new('ShaderNodeCombineXYZ')
            nt.links.new(sep.outputs['X'], comb.inputs[0])
            nt.links.new(sep.outputs['Z'], comb.inputs[1])
            br.offset = 0.0
            br.inputs['Scale'].default_value = 1.0
            br.inputs['Brick Width'].default_value = brick[0]
            br.inputs['Row Height'].default_value = brick[1]
            br.inputs['Mortar Size'].default_value = 0.004
            br.inputs['Color1'].default_value = (*base, 1)
            br.inputs['Color2'].default_value = (*[c * 0.93 for c in base], 1)
            br.inputs['Mortar'].default_value = (*[c * 0.8 for c in base], 1)
            nt.links.new(comb.outputs[0], br.inputs['Vector'])
            out = br.outputs['Color']
        # per-panel tone variation and tileable weathering
        cn = cell_noise(nt, bay, floor)
        mv = nt.nodes.new('ShaderNodeMapRange')
        mv.inputs['To Min'].default_value = 1 - var
        mv.inputs['To Max'].default_value = 1 + var * 0.5
        nt.links.new(cn, mv.inputs['Value'])
        n1 = torus_noise(nt, W, H, 3.0, 5)
        mr = nt.nodes.new('ShaderNodeMapRange')
        mr.inputs['From Min'].default_value = 0.35
        mr.inputs['From Max'].default_value = 0.65
        mr.inputs['To Min'].default_value = 1 - dirt
        mr.inputs['To Max'].default_value = 1.0
        nt.links.new(n1, mr.inputs['Value'])
        streak = torus_noise(nt, W, H, 7.0, 3, (6, 0.35))
        ms = nt.nodes.new('ShaderNodeMapRange')
        ms.inputs['From Min'].default_value = 0.45
        ms.inputs['From Max'].default_value = 0.75
        ms.inputs['To Min'].default_value = 1.0
        ms.inputs['To Max'].default_value = 1 - dirt * 0.8
        nt.links.new(streak, ms.inputs['Value'])
        m1 = nt.nodes.new('ShaderNodeMath')
        m1.operation = 'MULTIPLY'
        nt.links.new(mv.outputs[0], m1.inputs[0])
        nt.links.new(mr.outputs[0], m1.inputs[1])
        m2 = nt.nodes.new('ShaderNodeMath')
        m2.operation = 'MULTIPLY'
        nt.links.new(m1.outputs[0], m2.inputs[0])
        nt.links.new(ms.outputs[0], m2.inputs[1])
        mix = nt.nodes.new('ShaderNodeMix')
        mix.data_type = 'RGBA'
        mix.blend_type = 'MULTIPLY'
        mix.inputs['Factor'].default_value = 1.0
        nt.links.new(out, mix.inputs[6])
        gray = nt.nodes.new('ShaderNodeCombineColor')
        for i in range(3):
            nt.links.new(m2.outputs[0], gray.inputs[i])
        nt.links.new(gray.outputs[0], mix.inputs[7])
        nt.links.new(mix.outputs[2], b.inputs['Base Color'])
        if kind in ('plaster', 'concrete'):
            bump = nt.nodes.new('ShaderNodeBump')
            bump.inputs['Strength'].default_value = 0.25
            bump.inputs['Distance'].default_value = 0.004
            nn = nt.nodes.new('ShaderNodeTexNoise')
            nn.inputs['Scale'].default_value = 60
            nt.links.new(nn.outputs['Fac'], bump.inputs['Height'])
            nt.links.new(bump.outputs[0], b.inputs['Normal'])
    return mat(name, base, 0.85, build)


# ---------- facade types ----------
# window: (width, height, sill height above the floor line), frames: 'pvc' | 'wood' | 'dark'
TYPES = {
    'panelWhite': dict(bay=3.2, floor=2.8, wall=(0.74, 0.74, 0.71), kind='concrete', seams=True, win=(1.5, 1.45, 0.85), frames='mix', reveal=0.16),
    'panelBeige': dict(bay=3.2, floor=2.8, wall=(0.72, 0.62, 0.48), kind='tile', tile=(0.0533, 0.0467), seams=True, win=(1.5, 1.45, 0.85), frames='mix', reveal=0.16),
    'panelTower': dict(bay=3.2, floor=2.8, wall=(0.8, 0.8, 0.78), kind='concrete', seams=True, win=(1.5, 1.45, 0.85), frames='pvc', reveal=0.16, band=(0.45, 0.55, 0.64)),
    'khrushchevka': dict(bay=3.2, floor=2.75, wall=(0.62, 0.63, 0.62), kind='concrete', seams=True, win=(1.4, 1.4, 0.85), frames='wood', reveal=0.14, dirt=0.18),
    'khrushchevkaBrick': dict(bay=3.2, floor=2.75, wall=(0.78, 0.77, 0.72), kind='brick', brick=(0.2667, 0.0786), mortar=(0.6, 0.59, 0.56), win=(1.4, 1.4, 0.85), frames='wood', reveal=0.2, lintel=True),
    'redBrick': dict(bay=3.2, floor=2.8, wall=(0.47, 0.2, 0.13), kind='brick', brick=(0.2667, 0.08), mortar=(0.62, 0.58, 0.52), win=(1.45, 1.45, 0.85), frames='pvc', reveal=0.22, lintel=True),
    'stalinkaYellow': dict(bay=3.6, floor=3.4, wall=(0.8, 0.64, 0.36), kind='plaster', win=(1.5, 1.9, 0.9), frames='wood', reveal=0.3, trim=(0.92, 0.89, 0.8), surrounds=True, cornice=True),
    'stalinkaPeach': dict(bay=3.6, floor=3.4, wall=(0.78, 0.55, 0.43), kind='plaster', win=(1.5, 1.9, 0.9), frames='pvc', reveal=0.3, trim=(0.93, 0.88, 0.82), surrounds=True, cornice=True),
    'merchant': dict(bay=3.4, floor=3.8, wall=(0.55, 0.24, 0.16), kind='brick', brick=(0.2833, 0.0792), mortar=(0.66, 0.62, 0.55), win=(1.2, 2.0, 1.0), frames='wood', reveal=0.3, arch=True, trim=(0.86, 0.82, 0.74)),
    'modernResidential': dict(bay=3.4, floor=3.0, wall=(0.84, 0.84, 0.82), kind='concrete', win=(1.7, 1.75, 0.6), frames='dark', reveal=0.12, cladding=[(0.84, 0.84, 0.82), (0.55, 0.57, 0.6), (0.62, 0.36, 0.25), (0.84, 0.84, 0.82)], var=0.02),
    'school': dict(bay=4.2, floor=3.4, wall=(0.86, 0.78, 0.6), kind='plaster', win=(2.6, 2.1, 0.9), frames='pvc', reveal=0.2, trim=(0.95, 0.94, 0.9), cornice=True),
}

FRAME = {'pvc': (0.88, 0.88, 0.86), 'wood': (0.42, 0.27, 0.15), 'woodWhite': (0.78, 0.77, 0.72), 'dark': (0.12, 0.12, 0.13)}
CURTAIN = [(0.6, 0.55, 0.45), (0.52, 0.45, 0.34), (0.42, 0.33, 0.22), (0.64, 0.62, 0.56), (0.36, 0.42, 0.46), (0.5, 0.38, 0.38), (0.4, 0.45, 0.34), (0.66, 0.6, 0.48)]


def rnd(i, j, k=0):
    h = math.sin(i * 127.1 + j * 311.7 + k * 74.7) * 43758.5453
    return h - math.floor(h)


def build(name, t):
    sc = reset()
    MAT.clear()
    bay, fl = t['bay'], t['floor']
    W, H = 4 * bay, 4 * fl
    ww, wh, sill = t['win']
    rev = t['reveal']
    wallm = wall_material('wall', t['wall'], W, H, bay, fl, t['kind'], t.get('var', 0.06), t.get('dirt', 0.12), t.get('brick') or t.get('tile'), t.get('mortar'))
    mat('reveal', [c * 0.95 for c in t['wall']] if t['kind'] != 'brick' else (0.7, 0.69, 0.66), 0.8)
    mat('seam', (0.3, 0.3, 0.29), 0.9)
    mat('sill', (0.55, 0.56, 0.57), 0.5)
    mat('room', (0.05, 0.05, 0.055), 0.9)
    mat('trim', t.get('trim', (0.9, 0.9, 0.88)), 0.7)
    mat('band', t.get('band', (0.3, 0.3, 0.3)), 0.7)
    for k, c in FRAME.items():
        mat('frame_' + k, c, 0.5)
    for i, c in enumerate(CURTAIN):
        mat('curtain%d' % i, c, 0.9)
    mat('tulle', (0.92, 0.92, 0.9), 0.9)
    for i, c in enumerate(t.get('cladding', [])):
        mat('clad%d' % i, c, 0.6)
    T = 0.36  # wall thickness
    cells = [(i, j) for i in range(-1, 5) for j in range(-1, 5)]
    # wall slab and cutters
    wall = Mesh()
    wall.box(-bay, W + bay, 0, T, -fl, H + fl, 'wall')
    wo = wall.obj('wall')
    cut = Mesh()
    glass = []
    openings = []
    for i, j in cells:
        x0 = (i + 0.5) * bay - ww / 2
        z0 = j * fl + sill
        if t.get('arch'):
            cut.box(x0, x0 + ww, -0.2, T + 0.2, z0, z0 + wh - ww / 2, 'reveal')
            # arch top approximated by stacked boxes
            for k in range(8):
                a0 = math.pi * k / 8
                a1 = math.pi * (k + 1) / 8
                xa = (i + 0.5) * bay + math.cos(a0) * ww / 2
                xb = (i + 0.5) * bay + math.cos(a1) * ww / 2
                cut.box(min(xa, xb), max(xa, xb), -0.2, T + 0.2, z0 + wh - ww / 2, z0 + wh - ww / 2 + math.sin((a0 + a1) / 2) * ww / 2, 'reveal')
        else:
            cut.box(x0, x0 + ww, -0.2, T + 0.2, z0, z0 + wh, 'reveal')
        openings.append((x0, z0, ww, wh))
        if 0 <= i < 4 and 0 <= j < 4:
            glass.append((x0, z0, ww, wh, i, j))
    if t.get('seams'):
        for k in range(-1, 6):
            cut.box(k * bay - 0.012, k * bay + 0.012, -0.2, 0.015, -fl - 1, H + fl + 1, 'seam')
        for k in range(-1, 6):
            cut.box(-bay - 1, W + bay + 1, -0.2, 0.015, k * fl - 0.012, k * fl + 0.012, 'seam')
    co = cut.obj('cut')
    bo = wo.modifiers.new('b', 'BOOLEAN')
    bo.operation = 'DIFFERENCE'
    bo.solver = 'EXACT'
    bo.object = co
    bo.use_self = True
    bake_mods(wo)
    bpy.data.objects.remove(co)
    # materials by position: front face = wall, shallow grooves = seams, the rest = window reveals
    me = wo.data
    me.materials.clear()
    for n in ('wall', 'seam', 'reveal'):
        me.materials.append(MAT[n])
    for p in me.polygons:
        c = p.center
        if c.y < 1e-3 and p.normal.y < -0.9:
            p.material_index = 0
        elif c.y < 0.016 and t.get('seams') and not any(x0 - 0.01 < c.x < x0 + ww + 0.01 and z0 - 0.01 < c.z < z0 + wh + 0.01 for (x0, z0, ww_, wh_) in openings):
            p.material_index = 1
        elif c.y > T - 1e-3:
            p.material_index = 0
        else:
            p.material_index = 2
    if os.environ.get('DEBUG'):
        from collections import Counter
        print('faces', Counter((p.material_index, round(p.normal.y, 1), round(p.center.y, 3)) for p in me.polygons).most_common(12))
    # details: frames, sills, interior, decorations
    d = Mesh()
    clad = Mesh()
    d.box(-bay, W + bay, T + 0.6, T + 0.65, -fl, H + fl, 'room')
    bars = []  # frame bar rectangles in tile coords (for the glass mask)
    for i, j in cells:
        cx = (i + 0.5) * bay
        x0 = cx - ww / 2
        z0 = j * fl + sill
        top = z0 + wh - (ww / 2 if t.get('arch') else 0)
        r = rnd(i % 4, j % 4)
        ft = t['frames']
        if ft == 'mix':
            ft = 'pvc' if r < 0.6 else 'wood' if r < 0.85 else 'woodWhite'
        fm = 'frame_' + ft
        fy0, fy1 = 0.09, 0.15
        fw = 0.065
        rects = [(x0, z0, ww, fw), (x0, top - fw, ww, fw), (x0, z0, fw, top - z0), (x0 + ww - fw, z0, fw, top - z0)]
        # mullion(s) and transom
        if ww > 2.0:
            rects += [(x0 + ww / 3 - 0.03, z0, 0.06, top - z0), (x0 + 2 * ww / 3 - 0.03, z0, 0.06, top - z0)]
        else:
            rects.append((cx - 0.035 + (0.12 if ft == 'pvc' and r < 0.3 else 0), z0, 0.07, top - z0))
        if t['win'][1] > 1.6 or ft in ('wood', 'woodWhite'):
            rects.append((x0, top - (top - z0) * 0.3, ww, 0.06))
        for (rx, rz, rw, rh) in rects:
            d.box(rx, rx + rw, fy0, fy1, rz, rz + rh, fm)
            if 0 <= i < 4 and 0 <= j < 4:
                bars.append((rx, rz, rw, rh))
        # sill
        d.box(x0 - 0.05, x0 + ww + 0.05, -0.06, fy0, z0 - 0.04, z0, 'sill')
        # curtains, tulle
        rc = rnd(i % 4, j % 4, 3)
        if rc < 0.7:
            cm = 'curtain%d' % int(rnd(i % 4, j % 4, 5) * len(CURTAIN))
            cw = ww * (0.12 + rnd(i % 4, j % 4, 7) * 0.2)
            d.box(x0, x0 + cw, T + 0.25, T + 0.3, z0, top, cm)
            if rc < 0.5:
                d.box(x0 + ww - cw, x0 + ww, T + 0.25, T + 0.3, z0, top, cm)
        # decorations
        if t.get('surrounds'):
            s = 0.12
            d.box(x0 - s, x0, -0.04, 0.0, z0 - 0.05, top + s, 'trim')
            d.box(x0 + ww, x0 + ww + s, -0.04, 0.0, z0 - 0.05, top + s, 'trim')
            d.box(x0 - s - 0.1, x0 + ww + s + 0.1, -0.12, 0.0, top + s, top + s + 0.16, 'trim')
            d.box(x0 - 0.15, x0 + ww + 0.15, -0.1, 0.0, z0 - 0.3, z0 - 0.06, 'trim')
        if t.get('lintel'):
            d.box(x0 - 0.12, x0 + ww + 0.12, -0.015, 0.0, top, top + 0.2, 'reveal' if t['kind'] == 'brick' and t['wall'][0] > 0.6 else 'trim')
        if t.get('arch'):
            for k in range(9):
                a = math.pi * k / 8
                xa = cx + math.cos(a) * (ww / 2 + 0.12)
                za = z0 + wh - ww / 2 + math.sin(a) * (ww / 2 + 0.12)
                d.box(xa - 0.09, xa + 0.09, -0.05, 0.0, za - 0.09, za + 0.09, 'trim')
            d.box(x0 - 0.14, x0 + ww + 0.14, -0.08, 0.0, z0 - 0.12, z0, 'trim')
        if t.get('band'):
            d.box(i * bay, (i + 1) * bay, -0.01, 0.0, z0 - 0.4, z0 - 0.06, 'band')
        if t.get('cladding'):
            k = int(rnd(i % 4, j % 4, 9) * len(t['cladding']))
            clad.box(i * bay + 0.01, (i + 1) * bay - 0.01, -0.04, 0.0, j * fl + 0.01, (j + 1) * fl - 0.01, 'clad%d' % k)
    if t.get('cornice'):
        for j in range(-1, 6):
            d.box(-bay, W + bay, -0.1, 0.0, j * fl - 0.06, j * fl + 0.12, 'trim')
    do = d.obj('detail')
    if t.get('cladding'):
        co = clad.obj('clad')
        c2 = Mesh()
        for i, j in cells:
            x0 = (i + 0.5) * bay - ww / 2
            z0 = j * fl + sill
            c2.box(x0 - 0.02, x0 + ww + 0.02, -0.3, 0.05, z0 - 0.02, z0 + wh + 0.02, 'reveal')
        c2o = c2.obj('cut2')
        bo = co.modifiers.new('b', 'BOOLEAN')
        bo.operation = 'DIFFERENCE'
        bo.solver = 'EXACT'
        bo.object = c2o
        bake_mods(co)
        bpy.data.objects.remove(c2o)
    # camera: orthographic, looking along +y at the tile
    cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam'))
    sc.collection.objects.link(cam)
    cam.data.type = 'ORTHO'
    cam.data.ortho_scale = max(W, H)
    cam.data.sensor_fit = 'AUTO'
    rx, ry = (RES, round(RES * H / W)) if W >= H else (round(RES * W / H), RES)
    sc.render.resolution_x = rx
    sc.render.resolution_y = ry
    cam.location = (W / 2, -20, H / 2)
    cam.rotation_euler = (math.pi / 2, 0, 0)
    cam.data.clip_end = 100
    sc.camera = cam
    # compositor: write passes as EXR
    sc.use_nodes = True
    nt = sc.node_tree
    for n in list(nt.nodes):
        nt.nodes.remove(n)
    rl = nt.nodes.new('CompositorNodeRLayers')
    fo = nt.nodes.new('CompositorNodeOutputFile')
    fo.base_path = os.path.join(OUT, '_tmp_' + name)
    fo.format.file_format = 'OPEN_EXR'
    fo.format.color_depth = '32'
    fo.file_slots.clear()
    for p in ('DiffCol', 'AO', 'Normal', 'Depth'):
        fo.file_slots.new(p)
        nt.links.new(rl.outputs[p], fo.inputs[p])
    comp = nt.nodes.new('CompositorNodeComposite')
    nt.links.new(rl.outputs['Image'], comp.inputs[0])
    t0 = time.time()
    bpy.ops.render.render(write_still=False)
    print(name, 'render', round(time.time() - t0, 1), 's')

    def load(p):
        d = fo.base_path
        f = [x for x in os.listdir(d) if x.startswith(p)][0]
        img = bpy.data.images.load(os.path.join(d, f))
        a = np.array(img.pixels[:], dtype=np.float32).reshape(ry, rx, 4)[::-1]
        # resample to a square tile (bilinear)
        ys = np.linspace(0, ry - 1, RES)
        xs = np.linspace(0, rx - 1, RES)
        y0 = np.floor(ys).astype(int); y1 = np.minimum(y0 + 1, ry - 1); fy = (ys - y0)[:, None, None]
        x0 = np.floor(xs).astype(int); x1 = np.minimum(x0 + 1, rx - 1); fx = (xs - x0)[None, :, None]
        top = a[y0][:, x0] * (1 - fx) + a[y0][:, x1] * fx
        bot = a[y1][:, x0] * (1 - fx) + a[y1][:, x1] * fx
        return top * (1 - fy) + bot * fy
    col = load('DiffCol')[..., :3]
    ao = load('AO')[..., :1]
    nrm = load('Normal')[..., :3]
    shade = 0.32 + 0.68 * np.clip(ao, 0, 1)
    rgb = srgb(col * shade)
    write_png(os.path.join(OUT, name + '_col.png'), (rgb * 255 + 0.5).astype(np.uint8))
    # tangent space (x right, y up, z toward the viewer): surface bumps from the normal pass plus
    # relief from the depth pass (window recesses, sills, cornices) turned into bevel-like slopes
    ts = np.stack([nrm[..., 0], nrm[..., 2], -nrm[..., 1]], -1)
    depth = load('Depth')[..., 0]
    hgt = np.clip(20.0 - depth, -0.25, 0.15)
    def blur(a, r):
        k = np.exp(-0.5 * (np.arange(-3, 4) / r) ** 2)
        k /= k.sum()
        for ax in (0, 1):
            a = sum(np.roll(a, i - 3, ax) * k[i] for i in range(7))
        return a
    hgt = blur(hgt, 1.2)
    gx = (np.roll(hgt, -1, 1) - np.roll(hgt, 1, 1)) / (2 * W / RES)
    gz = -(np.roll(hgt, -1, 0) - np.roll(hgt, 1, 0)) / (2 * H / RES)
    k = 0.3
    ts = np.stack([ts[..., 0] - gx * k, ts[..., 1] - gz * k, np.maximum(0.2, ts[..., 2])], -1)
    ts /= np.maximum(1e-6, np.linalg.norm(ts, axis=-1, keepdims=True))
    write_png(os.path.join(OUT, name + '_nrm.png'), ((ts * 0.5 + 0.5) * 255 + 0.5).astype(np.uint8))
    # glass mask from the known window rectangles (minus frame bars)
    m = np.zeros((RES, RES), np.uint8)
    px = lambda x: int(round(x / W * RES))
    pz = lambda z: int(round(z / H * RES))
    for (x0, z0, w, h, i, j) in glass:
        top = z0 + h - (w / 2 if t.get('arch') else 0)
        m[RES - pz(top):RES - pz(z0), px(x0):px(x0 + w)] = 255
    for (rx, rz, rw, rh) in bars:
        m[RES - pz(rz + rh):RES - pz(rz), max(0, px(rx)):px(rx + rw)] = 0
    write_png(os.path.join(OUT, name + '_msk.png'), m[..., None])
    import shutil
    shutil.rmtree(fo.base_path, ignore_errors=True)


for name, t in TYPES.items():
    if ONLY and name not in ONLY:
        continue
    build(name, t)
print('done')
