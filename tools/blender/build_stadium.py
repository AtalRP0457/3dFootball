"""Build the stadium in Blender from the shared layout and export it.

Run (headless):
  /Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup \
      --python tools/blender/build_stadium.py -- \
      --layout src/render/stadium/layout.json \
      --blend assets-src/blender/stadium.blend \
      --glb public/assets/stadium/stadium.glb

Everything is modelled from `layout.json`, the same file the game uses to
seat the crowd, so terraces, aisles and spectators line up exactly.

Axes: the layout uses three.js axes (x along the pitch, y up, z across).
Blender is Z-up, so a three.js point (x, y, z) is placed at Blender
(x, -z, y); the glTF exporter (+Y up) turns it back into (x, y, z).

Objects (one per category, merged per material to keep draw calls low):
  Stands, Seats, Aisles, Railings, Vomitories, Concourse, Roof, RoofGlass,
  Lamps, Masts, Facade, Tunnel, Dugouts, Screen_A, Screen_B, LED_Ribbon_*
The game looks objects up by these names (screens and LED ribbons get live
canvas textures; lamps drive the floodlight glow; quality levels can hide
optional parts).
"""
import bpy
import bmesh
import json
import math
import os
import sys
from mathutils import Vector

# ----------------------------------------------------------------- arguments
argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
def arg(name, default):
    return argv[argv.index(name) + 1] if name in argv else default

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
LAYOUT = os.path.join(ROOT, arg('--layout', 'src/render/stadium/layout.json'))
BLEND = os.path.join(ROOT, arg('--blend', 'assets-src/blender/stadium.blend'))
GLB = os.path.join(ROOT, arg('--glb', 'public/assets/stadium/stadium.glb'))
with open(LAYOUT) as f:
    LY = json.load(f)

HALF_L = LY['pitch']['length'] / 2
HALF_W = LY['pitch']['width'] / 2
MARGIN = LY['pitch']['margin']
LOW, UP = LY['lower'], LY['upper']

# ----------------------------------------------------------------- scene
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.unit_settings.system = 'METRIC'

def B(p):
    """three.js (x, y, z) -> Blender (x, -z, y)."""
    return Vector((p[0], -p[2], p[1]))

# ----------------------------------------------------------------- materials
MATS = {}
def mat(name, color, rough=0.8, metal=0.0, emit=None, emit_strength=0.0, alpha=1.0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    bsdf = m.node_tree.nodes.get('Principled BSDF')
    bsdf.inputs['Base Color'].default_value = (*color, 1.0)
    bsdf.inputs['Roughness'].default_value = rough
    bsdf.inputs['Metallic'].default_value = metal
    if emit is not None:
        bsdf.inputs['Emission Color'].default_value = (*emit, 1.0)
        bsdf.inputs['Emission Strength'].default_value = emit_strength
    if alpha < 1.0:
        bsdf.inputs['Alpha'].default_value = alpha
        m.blend_method = 'BLEND' if hasattr(m, 'blend_method') else None
        try:
            m.surface_render_method = 'BLENDED'
        except Exception:
            pass
    m.diffuse_color = (*color, alpha)
    MATS[name] = m
    return m

def srgb(h):
    h = h.lstrip('#')
    c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return tuple(((v + 0.055) / 1.055) ** 2.4 if v > 0.04045 else v / 12.92 for v in c)

mat('Concrete', srgb('#8d9199'), 0.92)
mat('ConcreteLight', srgb('#b8bcc2'), 0.9)
mat('ConcreteDark', srgb('#3a3e46'), 0.95)
mat('Seat', srgb('#1d3c8c'), 0.55)
mat('SeatAccent', srgb('#e7e9ee'), 0.55)
mat('SteelPainted', srgb('#e9ecf1'), 0.45, 0.6)
mat('SteelDark', srgb('#2b3039'), 0.5, 0.7)
mat('RoofMetal', srgb('#8a929e'), 0.5, 0.55)
mat('RoofRib', srgb('#5d6571'), 0.5, 0.6)
mat('Glass', srgb('#a9c7e6'), 0.05, 0.0, alpha=0.28)
mat('Lamp', srgb('#fffbe8'), 0.3, 0.0, emit=srgb('#fff6dc'), emit_strength=6.0)
mat('LampHousing', srgb('#1b1f26'), 0.6, 0.6)
mat('Cladding', srgb('#2f3540'), 0.7, 0.35)
mat('Interior', srgb('#0c0e12'), 1.0)
mat('Screen', srgb('#0a0d14'), 0.3, 0.0, emit=srgb('#203050'), emit_strength=1.0)
mat('LED', srgb('#101418'), 0.35, 0.0, emit=srgb('#1a2a44'), emit_strength=1.0)
mat('TunnelShell', srgb('#f2f3f5'), 0.5)
mat('TunnelStripe', srgb('#c8102e'), 0.5)
mat('DugoutSeat', srgb('#b91c1c'), 0.5)
mat('Ground', srgb('#2a2d33'), 0.95)

# ----------------------------------------------------------------- mesh builder
class Builder:
    """Collects polygons per material and makes one object per category."""
    def __init__(self, name):
        self.name = name
        self.bm = bmesh.new()
        self.slots = []

    def _slot(self, m):
        if m not in self.slots:
            self.slots.append(m)
        return self.slots.index(m)

    def poly(self, pts, m):
        vs = [self.bm.verts.new(B(p)) for p in pts]
        f = self.bm.faces.new(vs)
        f.material_index = self._slot(m)
        return f

    def quad(self, a, b, c, d, m):
        return self.poly([a, b, c, d], m)

    def box(self, center, size, m, yaw=0.0):
        """Axis-aligned (in its own yaw) box: center (x,y,z), size (sx,sy,sz)."""
        cx, cy, cz = center
        sx, sy, sz = (s / 2 for s in size)
        c, s = math.cos(yaw), math.sin(yaw)
        def P(x, y, z):
            # local x along, z across, rotated about y by yaw
            return (cx + x * c + z * s, cy + y, cz - x * s + z * c)
        v = [P(x, y, z) for x in (-sx, sx) for y in (-sy, sy) for z in (-sz, sz)]
        faces = [(0, 1, 3, 2), (4, 6, 7, 5), (0, 4, 5, 1), (2, 3, 7, 6), (0, 2, 6, 4), (1, 5, 7, 3)]
        for f in faces:
            self.poly([v[i] for i in f], m)

    def beam(self, a, b, w, m):
        """Square beam between three.js points a and b."""
        ax, ay, az = a
        bx, by, bz = b
        d = Vector((bx - ax, by - ay, bz - az))
        L = d.length
        if L < 1e-4:
            return
        d.normalize()
        up = Vector((0, 1, 0)) if abs(d.y) < 0.95 else Vector((1, 0, 0))
        s1 = d.cross(up).normalized() * (w / 2)
        s2 = d.cross(s1).normalized() * (w / 2)
        A, Bv = Vector(a), Vector(b)
        corners = [s1 + s2, s1 - s2, -s1 - s2, -s1 + s2]
        ring0 = [tuple(A + c) for c in corners]
        ring1 = [tuple(Bv + c) for c in corners]
        for i in range(4):
            j = (i + 1) % 4
            self.poly([ring0[i], ring0[j], ring1[j], ring1[i]], m)
        self.poly(ring0[::-1], m)
        self.poly(ring1, m)

    def tube(self, pts, r, m, sides=6):
        """Round rail through a polyline (three.js points)."""
        for p, q in zip(pts[:-1], pts[1:]):
            d = Vector(q) - Vector(p)
            if d.length < 1e-4:
                continue
            d.normalize()
            up = Vector((0, 1, 0)) if abs(d.y) < 0.95 else Vector((1, 0, 0))
            u = d.cross(up).normalized()
            v = d.cross(u).normalized()
            ring = lambda c: [tuple(Vector(c) + (u * math.cos(t) + v * math.sin(t)) * r) for t in [2 * math.pi * k / sides for k in range(sides)]]
            r0, r1 = ring(p), ring(q)
            for i in range(sides):
                j = (i + 1) % sides
                self.poly([r0[i], r0[j], r1[j], r1[i]], m)

    def finish(self, collection=None):
        me = bpy.data.meshes.new(self.name)
        bmesh.ops.remove_doubles(self.bm, verts=self.bm.verts, dist=1e-5)
        bmesh.ops.recalc_face_normals(self.bm, faces=self.bm.faces)
        self.bm.to_mesh(me)
        self.bm.free()
        for m in self.slots:
            me.materials.append(m)
        ob = bpy.data.objects.new(self.name, me)
        (collection or scene.collection).objects.link(ob)
        return ob

# ----------------------------------------------------------------- layout
side_z = HALF_W + MARGIN + LY['frontGap']
end_x = HALF_L + MARGIN + LY['frontGap']
extra = LY['standExtra']

def V(x, z):
    return Vector((x, 0, z))

stands = [
    dict(name='far', origin=V(0, -side_z), along=V(1, 0), out=V(0, -1), length=2 * HALF_L + 2 * MARGIN + extra, tiers=2),
    dict(name='west', origin=V(-end_x, 0), along=V(0, 1), out=V(-1, 0), length=2 * HALF_W + 2 * MARGIN + extra, tiers=2),
    dict(name='east', origin=V(end_x, 0), along=V(0, -1), out=V(1, 0), length=2 * HALF_W + 2 * MARGIN + extra, tiers=2),
    dict(name='near', origin=V(0, side_z), along=V(-1, 0), out=V(0, 1), length=2 * HALF_L + 2 * MARGIN + extra, tiers=1),
]
ci = LY['cornerInset']
for sx in (-1, 1):
    for sz in (-1, 1):
        out = V(sx, sz).normalized()
        along = V(-sz, sx).normalized()
        stands.append(dict(name=f'corner{sx}{sz}', origin=V(sx * (end_x + ci), sz * (side_z + ci)), along=along, out=out,
                           length=LY['cornerLength'], tiers=1 if sz > 0 else 2))

low_depth = LOW['rows'] * LOW['depth']
low_top = LOW['startY'] + LOW['rows'] * LOW['rise']
up_start = low_top + UP['gapY']
up_d = low_depth - UP['setBack']
up_top = up_start + UP['rows'] * UP['rise']
up_depth = UP['rows'] * UP['depth']
roof_y = up_top + LY['roof']['clearance']
roof_back = up_d + up_depth + LY['roof']['backExtra']
roof_front = -LY['roof']['frontOverhang']

def aisles(length):
    """Along-positions (relative to the stand centre) of the aisles."""
    out, a = [], -length / 2 + LY['aisleEvery']
    while a < length / 2 - 2:
        out.append(a)
        a += LY['aisleEvery']
    return out

def segments(length):
    """Seated blocks between aisles: list of (a0, a1)."""
    hw = LY['aisleWidth'] / 2
    cuts = aisles(length)
    edges = [-length / 2] + [x for c in cuts for x in (c - hw, c + hw)] + [length / 2]
    return [(edges[i], edges[i + 1]) for i in range(0, len(edges), 2)]

def P(st, a, y, d):
    """Stand-local (along a, height y, out d) -> three.js point."""
    o, al, ou = st['origin'], st['along'], st['out']
    return (o.x + al.x * a + ou.x * d, y, o.z + al.z * a + ou.z * d)

VOM_SPANS = {}
stands_b = Builder('Stands')
seats_b = Builder('Seats')
aisle_b = Builder('Aisles')
rail_b = Builder('Railings')
vom_b = Builder('Vomitories')
conc_b = Builder('Concourse')
roof_b = Builder('Roof')
glass_b = Builder('RoofGlass')
lamp_b = Builder('Lamps')
facade_b = Builder('Facade')
M = MATS

def terrace(st, rows, rise, depth, y0, d0, L):
    """Stepped treads + risers for one tier (in stand-local coords)."""
    for r in range(rows):
        za, zb = d0 + r * depth, d0 + (r + 1) * depth
        y = y0 + r * rise
        stands_b.quad(P(st, -L, y, za), P(st, L, y, za), P(st, L, y, zb), P(st, -L, y, zb), M['Concrete'])
        yb = max(0.0, y0 + (r - 1) * rise) if r > 0 else max(0.0, y0 - 1.4)
        stands_b.quad(P(st, -L, yb, za), P(st, L, yb, za), P(st, L, y, za), P(st, -L, y, za), M['Concrete'])
    # End walls (close the sides of the stepped block).
    top = y0 + rows * rise
    back = d0 + rows * depth
    for a in (-L, L):
        pts = [P(st, a, max(0.0, y0 - 1.4), d0)]
        for r in range(rows):
            y = y0 + r * rise
            pts += [P(st, a, y, d0 + r * depth), P(st, a, y, d0 + (r + 1) * depth)]
        pts.append(P(st, a, max(0.0, y0 - 1.4), back))
        stands_b.poly(pts if a > 0 else pts[::-1], M['ConcreteDark'])
    return top, back

def seat_backs(st, rows, rise, depth, y0, d0, L, accent_rows=(), voms=()):
    for r in range(rows):
        y = y0 + r * rise
        d = d0 + r * depth + depth * 0.72
        m = M['SeatAccent'] if r in accent_rows else M['Seat']
        spans = []
        for a0, a1 in segments(2 * L):
            cut = [(v0, v1) for v0, v1, r0, r1, _, _ in voms if r0 <= r < r1 and v0 < a1 and v1 > a0]
            if not cut:
                spans.append((a0, a1)); continue
            v0, v1 = cut[0]
            if v0 > a0: spans.append((a0, v0))
            if v1 < a1: spans.append((v1, a1))
        for a0, a1 in spans:
            # seat pan + back as a low ridge (individual seats are implied by
            # the crowd; empty seats read as the coloured strip)
            seats_b.quad(P(st, a0, y + 0.42, d), P(st, a1, y + 0.42, d), P(st, a1, y + 0.02, d + 0.06), P(st, a0, y + 0.02, d + 0.06), m)
            seats_b.quad(P(st, a0, y + 0.02, d - 0.36), P(st, a1, y + 0.02, d - 0.36), P(st, a1, y + 0.3, d - 0.02), P(st, a0, y + 0.3, d - 0.02), m)

def aisle_strips(st, rows, rise, depth, y0, d0, L, voms):
    hw = LY['aisleWidth'] / 2
    for i, a in enumerate(aisles(2 * L)):
        for r in range(rows):
            y = y0 + r * rise + 0.012
            za, zb = d0 + r * depth, d0 + (r + 1) * depth
            # two half steps per row
            mid = (za + zb) / 2
            aisle_b.quad(P(st, a - hw, y, za), P(st, a + hw, y, za), P(st, a + hw, y, mid), P(st, a - hw, y, mid), M['ConcreteLight'])
            aisle_b.quad(P(st, a - hw, y + rise / 2, mid), P(st, a + hw, y + rise / 2, mid), P(st, a + hw, y + rise / 2, zb), P(st, a - hw, y + rise / 2, zb), M['ConcreteLight'])
            aisle_b.quad(P(st, a - hw, y, mid), P(st, a + hw, y, mid), P(st, a + hw, y + rise / 2, mid), P(st, a - hw, y + rise / 2, mid), M['ConcreteLight'])
        # handrail up the aisle
        rail_b.tube([P(st, a, y0 + 0.95, d0 + 0.4), P(st, a, y0 + (rows - 1) * rise + 0.95, d0 + rows * depth - 0.4)], 0.025, M['SteelPainted'])
        if voms and i % 2 == 1 and rows > 14:
            # Vomitory (entry tunnel) beside the aisle, cut into the terrace:
            # its steps are dark (the opening), with low parapet walls on
            # both sides that follow the stepping and a rail across the front.
            r0, r1 = rows // 2 - 3, rows // 2 + 3
            ax0, ax1 = a + hw + 0.05, a + hw + 2.6
            for r in range(r0, r1):
                y = y0 + r * rise + 0.015
                za, zb = d0 + r * depth, d0 + (r + 1) * depth
                yd = y - (r - r0 + 1) * rise * 0.9  # the opening drops away inside
                vom_b.quad(P(st, ax0, yd, za), P(st, ax1, yd, za), P(st, ax1, yd, zb), P(st, ax0, yd, zb), M['Interior'])
                vom_b.quad(P(st, ax0, yd, za), P(st, ax1, yd, za), P(st, ax1, y, za), P(st, ax0, y, za), M['Interior'])
                for ax in (ax0, ax1):
                    # parapet wall: from the opening floor up to 0.9 m above the tread
                    vom_b.quad(P(st, ax, yd, za), P(st, ax, yd, zb), P(st, ax, y + 0.9, zb), P(st, ax, y + 0.9, za), M['Concrete'])
                    vom_b.quad(P(st, ax - 0.12, y + 0.9, za), P(st, ax - 0.12, y + 0.9, zb), P(st, ax + 0.12, y + 0.9, zb), P(st, ax + 0.12, y + 0.9, za), M['ConcreteLight'])
            yf = y0 + r0 * rise
            zf = d0 + r0 * depth
            rail_b.tube([P(st, ax0, yf + 1.0, zf), P(st, ax1, yf + 1.0, zf)], 0.03, M['SteelPainted'])
            VOM_SPANS.setdefault(id(st), []).append((ax0, ax1, r0, r1, d0, depth))

for st in stands:
    L = st['length'] / 2
    # Pitch-side wall in front of the lower tier.
    stands_b.quad(P(st, -L, 0, -0.3), P(st, L, 0, -0.3), P(st, L, 1.5, -0.3), P(st, -L, 1.5, -0.3), M['ConcreteDark'])
    stands_b.quad(P(st, -L, 1.5, -0.3), P(st, L, 1.5, -0.3), P(st, L, 1.5, 0), P(st, -L, 1.5, 0), M['ConcreteDark'])
    terrace(st, LOW['rows'], LOW['rise'], LOW['depth'], LOW['startY'], 0.0, L)
    aisle_strips(st, LOW['rows'], LOW['rise'], LOW['depth'], LOW['startY'], 0.0, L, voms=True)
    seat_backs(st, LOW['rows'], LOW['rise'], LOW['depth'], LOW['startY'], 0.0, L, accent_rows=(6, 13), voms=VOM_SPANS.get(id(st), []))
    rail_b.tube([P(st, -L, 2.45, 0.05), P(st, L, 2.45, 0.05)], 0.03, M['SteelPainted'])
    for a in [x / 2 for x in range(int(-2 * L), int(2 * L) + 1, 6)]:
        rail_b.beam(P(st, a, 1.5, 0.05), P(st, a, 2.45, 0.05), 0.04, M['SteelPainted'])
    if st['tiers'] == 1:
        # Back of a single tier: a low wall with a rail (the TV side has no
        # tall facade: the broadcast camera sits above it when zoomed out).
        if st['name'] == 'near':
            facade_b.quad(P(st, -L, 0, low_depth), P(st, L, 0, low_depth), P(st, L, low_top + 1.1, low_depth), P(st, -L, low_top + 1.1, low_depth), M['Cladding'])
            continue
        facade_b.quad(P(st, -L, 0, low_depth), P(st, L, 0, low_depth), P(st, L, low_top + 4, low_depth), P(st, -L, low_top + 4, low_depth), M['Cladding'])
        rail_b.tube([P(st, -L, low_top + 1.0, low_depth - 0.1), P(st, L, low_top + 1.0, low_depth - 0.1)], 0.03, M['SteelPainted'])
        continue
    # ---- concourse between the tiers ----
    conc_b.quad(P(st, -L, low_top, low_depth), P(st, L, low_top, low_depth), P(st, L, low_top, low_depth + 4.5), P(st, -L, low_top, low_depth + 4.5), M['Concrete'])
    conc_b.quad(P(st, -L, low_top, low_depth + 4.5), P(st, L, low_top, low_depth + 4.5), P(st, L, up_start, low_depth + 4.5), P(st, -L, up_start, low_depth + 4.5), M['ConcreteDark'])
    # Lit doorways along the concourse back wall.
    for a in [x for x in range(int(-L) + 4, int(L) - 3, 9)]:
        lamp_b.quad(P(st, a - 1.1, low_top + 0.2, low_depth + 4.45), P(st, a + 1.1, low_top + 0.2, low_depth + 4.45), P(st, a + 1.1, low_top + 2.4, low_depth + 4.45), P(st, a - 1.1, low_top + 2.4, low_depth + 4.45), M['Lamp'])
    rail_b.tube([P(st, -L, low_top + 1.05, low_depth - 0.1), P(st, L, low_top + 1.05, low_depth - 0.1)], 0.03, M['SteelPainted'])
    # Upper tier fascia (LED ribbon is a separate named object) and soffit.
    conc_b.quad(P(st, -L, low_top + 0.5, up_d - 0.05), P(st, L, low_top + 0.5, up_d - 0.05), P(st, L, up_start + 0.3, up_d - 0.05), P(st, -L, up_start + 0.3, up_d - 0.05), M['ConcreteDark'])
    conc_b.quad(P(st, -L, low_top + 0.5, up_d - 0.05), P(st, -L, low_top + 0.5, low_depth + 4.5), P(st, L, low_top + 0.5, low_depth + 4.5), P(st, L, low_top + 0.5, up_d - 0.05), M['ConcreteDark'])
    conc_b.quad(P(st, -L, up_start - 0.2, up_d), P(st, -L, up_top - 1.2, up_d + up_depth), P(st, L, up_top - 1.2, up_d + up_depth), P(st, L, up_start - 0.2, up_d), M['ConcreteDark'])
    # ---- upper tier ----
    terrace(st, UP['rows'], UP['rise'], UP['depth'], up_start, up_d, L)
    seat_backs(st, UP['rows'], UP['rise'], UP['depth'], up_start, up_d, L, accent_rows=(7,))
    aisle_strips(st, UP['rows'], UP['rise'], UP['depth'], up_start, up_d, L, voms=False)
    rail_b.tube([P(st, -L, up_start + 1.0, up_d + 0.05), P(st, L, up_start + 1.0, up_d + 0.05)], 0.03, M['SteelPainted'])
    # ---- facade behind ----
    facade_b.quad(P(st, -L, 0, up_d + up_depth + 0.2), P(st, L, 0, up_d + up_depth + 0.2), P(st, L, roof_y + 0.4, up_d + up_depth + 0.2), P(st, -L, roof_y + 0.4, up_d + up_depth + 0.2), M['Cladding'])
    for a in [x for x in range(int(-L), int(L) + 1, 4)]:
        facade_b.box(P(st, a, (roof_y + 0.4) / 2, up_d + up_depth + 0.45), (0.3, roof_y + 0.4, 0.5), M['SteelDark'], yaw=math.atan2(st['out'].x, st['out'].z))
    # ---- roof: cantilever trusses, metal deck, glass leading edge ----
    yaw = math.atan2(st['out'].x, st['out'].z)
    deck_back_y = roof_y + 1.6
    roof_b.quad(P(st, -L - 2, roof_y + 0.25, 0), P(st, L + 2, roof_y + 0.25, 0), P(st, L + 2, deck_back_y, roof_back), P(st, -L - 2, deck_back_y, roof_back), M['RoofMetal'])
    roof_b.quad(P(st, -L - 2, roof_y + 0.05, 0), P(st, -L - 2, deck_back_y - 0.2, roof_back), P(st, L + 2, deck_back_y - 0.2, roof_back), P(st, L + 2, roof_y + 0.05, 0), M['SteelDark'])
    # Standing-seam ribs across the deck (reads as metal sheeting from above).
    a = -L - 2
    while a <= L + 2:
        roof_b.beam(P(st, a, roof_y + 0.33, 0), P(st, a, deck_back_y + 0.08, roof_back), 0.12, M['RoofRib'])
        a += 3.0
    glass_b.quad(P(st, -L - 2, roof_y + 0.25, roof_front), P(st, L + 2, roof_y + 0.25, roof_front), P(st, L + 2, roof_y + 0.25, 0), P(st, -L - 2, roof_y + 0.25, 0), M['Glass'])
    a = -L
    while a <= L + 0.01:
        top_f = P(st, a, roof_y + 0.2, roof_front)
        top_b = P(st, a, deck_back_y, roof_back)
        bot_b = P(st, a, deck_back_y - 5.5, roof_back)
        bot_f = P(st, a, roof_y - 0.9, roof_front + 1.0)
        roof_b.beam(top_f, top_b, 0.35, M['SteelPainted'])
        roof_b.beam(bot_f, bot_b, 0.3, M['SteelPainted'])
        roof_b.beam(top_f, bot_f, 0.25, M['SteelPainted'])
        n = 6
        for k in range(1, n):
            t0, t1 = (k - 1) / n, k / n
            lerp = lambda p, q, t: tuple(pp + (qq - pp) * t for pp, qq in zip(p, q))
            roof_b.beam(lerp(top_f, top_b, t1), lerp(bot_f, bot_b, t1), 0.14, M['SteelPainted'])
            roof_b.beam(lerp(top_f, top_b, t0), lerp(bot_f, bot_b, t1), 0.12, M['SteelPainted'])
        roof_b.beam(P(st, a, 0, roof_back), P(st, a, deck_back_y, roof_back), 0.7, M['SteelPainted'])
        a += LY['roof']['trussEvery'] if L > 20 else L
    # Front girder with the floodlight bank and catwalk.
    roof_b.beam(P(st, -L - 2, roof_y - 0.5, roof_front + 0.4), P(st, L + 2, roof_y - 0.5, roof_front + 0.4), 0.6, M['SteelPainted'])
    lamp_b.quad(P(st, -L, roof_y - 1.0, roof_front + 1.2), P(st, L, roof_y - 1.0, roof_front + 1.2), P(st, L, roof_y - 1.0, roof_front + 2.2), P(st, -L, roof_y - 1.0, roof_front + 2.2), M['SteelDark'])
    a = -L + 1.5
    while a < L - 1:
        c = P(st, a, roof_y - 1.45, roof_front + 1.7)
        lamp_b.box(c, (1.1, 0.7, 0.6), M['LampHousing'], yaw=yaw)
        # Lit face, tilted towards the pitch.
        lamp_b.quad(P(st, a - 0.45, roof_y - 1.82, roof_front + 1.38), P(st, a + 0.45, roof_y - 1.82, roof_front + 1.38), P(st, a + 0.45, roof_y - 1.3, roof_front + 1.38), P(st, a - 0.45, roof_y - 1.3, roof_front + 1.38), M['Lamp'])
        a += 2.6

# ---- close the bowl at the far corners: roof caps + cladding ----
far = next(s for s in stands if s['name'] == 'far')
Lf = far['length'] / 2 + 2
Le = next(s for s in stands if s['name'] == 'east')['length'] / 2 + 2
deck_back_y = roof_y + 1.6
for sx in (-1, 1):
    F1 = (sx * Lf, roof_y + 0.25, -side_z)
    F2 = (sx * Lf, deck_back_y, -(side_z + roof_back))
    E1 = (sx * end_x, roof_y + 0.25, -Le)
    E2 = (sx * (end_x + roof_back), deck_back_y, -Le)
    X = (sx * (end_x + roof_back), deck_back_y, -(side_z + roof_back))
    for tri in ((X, F2, F1), (X, F1, E1), (X, E1, E2)):
        roof_b.poly(list(tri) if sx > 0 else list(tri)[::-1], M['RoofMetal'])
        roof_b.poly(list(tri)[::-1] if sx > 0 else list(tri), M['SteelDark'])
    for p_, q_ in ((F2, X), (X, E2)):
        facade_b.quad((p_[0], 0, p_[2]), (q_[0], 0, q_[2]), (q_[0], q_[1], q_[2]), (p_[0], p_[1], p_[2]), M['Cladding'])
        facade_b.quad((q_[0], 0, q_[2]), (p_[0], 0, p_[2]), (p_[0], p_[1], p_[2]), (q_[0], q_[1], q_[2]), M['Cladding'])

# ---- corner floodlight masts (near corners have no roof) ----
mast_b = Builder('Masts')
for sx in (-1, 1):
    base = (sx * (end_x + 22), 0, side_z + 20)
    top = (base[0], 46, base[2])
    mast_b.beam(base, top, 1.1, M['SteelPainted'])
    head_c = (top[0] - sx * 1.2, top[1] + 2.5, top[2] - 1.2)
    yaw = math.atan2(-base[0], -base[2])
    mast_b.box(head_c, (9, 6, 0.6), M['LampHousing'], yaw=yaw)
    for i in range(5):
        for j in range(4):
            off_a = -3.6 + i * 1.8
            off_y = -2.1 + j * 1.4
            c, s = math.cos(yaw), math.sin(yaw)
            cx = head_c[0] + off_a * c + 0.35 * s
            cz = head_c[2] - off_a * s + 0.35 * c
            mast_b.box((cx, head_c[1] + off_y, cz), (1.3, 1.0, 0.12), M['Lamp'], yaw=yaw)

# ---- player tunnel (near side, halfway) and dugouts ----
tun_b = Builder('Tunnel')
tw, th = LY['tunnel']['width'], LY['tunnel']['height']
tz0, tz1 = side_z - 0.3, HALF_W + 2.6
segs = 10
for k in range(segs):
    a0, a1 = math.pi * k / segs, math.pi * (k + 1) / segs
    x0, y0 = math.cos(a0) * tw / 2, math.sin(a0) * th
    x1, y1 = math.cos(a1) * tw / 2, math.sin(a1) * th
    m = M['TunnelStripe'] if k in (2, 7) else M['TunnelShell']
    tun_b.quad((x0, y0, tz1), (x1, y1, tz1), (x1, y1, tz0), (x0, y0, tz0), m)
    tun_b.quad((x1 * 0.9, y1 * 0.9, tz1 + 0.01), (x0 * 0.9, y0 * 0.9, tz1 + 0.01), (x0 * 0.9, y0 * 0.9, tz0), (x1 * 0.9, y1 * 0.9, tz0), M['Interior'])
# Rings along the tunnel.
for z in (tz1, (tz0 + tz1) / 2):
    pts = [(math.cos(math.pi * k / 16) * (tw / 2 + 0.05), math.sin(math.pi * k / 16) * (th + 0.05), z) for k in range(17)]
    tun_b.tube(pts, 0.06, M['SteelDark'])
tun_b.quad((-tw / 2, 0, tz0 + 0.02), (tw / 2, 0, tz0 + 0.02), (tw / 2, th, tz0 + 0.02), (-tw / 2, th, tz0 + 0.02), M['Interior'])

dug_b = Builder('Dugouts')
for dx in LY['dugouts']:
    z0, z1 = HALF_W + 2.3, HALF_W + 3.9
    w = 7.0
    dug_b.box((dx, 0.08, (z0 + z1) / 2), (w, 0.16, z1 - z0), M['ConcreteDark'])
    dug_b.box((dx, 1.15, z1), (w, 2.3, 0.08), M['SteelDark'])
    for sxx in (-1, 1):
        dug_b.box((dx + sxx * w / 2, 1.15, (z0 + z1) / 2), (0.08, 2.3, z1 - z0), M['SteelDark'])
    dug_b.box((dx, 2.32, (z0 + z1) / 2 - 0.2), (w + 0.2, 0.06, z1 - z0 + 0.4), M['Glass'])
    for i in range(10):
        dug_b.box((dx - w / 2 + 0.45 + i * 0.68, 0.55, z1 - 0.35), (0.55, 0.1, 0.45), M['DugoutSeat'])
        dug_b.box((dx - w / 2 + 0.45 + i * 0.68, 0.9, z1 - 0.12), (0.55, 0.6, 0.08), M['DugoutSeat'])

# ---- giant screens over the far corners ----
sc = LY['screens']
screen_objs = []
for name, sx in (('Screen_A', -1), ('Screen_B', 1)):
    st = next(s for s in stands if s['name'] == f'corner{sx}-1')
    c = st['origin'] + st['out'] * (low_depth * 0.6)
    yaw = math.atan2(st['out'].x, st['out'].z)
    cy = roof_y - sc['height'] / 2 - 1.5
    frame = Builder(f'{name}_Frame')
    frame.box((c.x, cy, c.z), (sc['width'] + 0.8, sc['height'] + 0.8, 0.6), M['SteelDark'], yaw=yaw)
    frame.beam((c.x, cy + sc['height'] / 2, c.z), (c.x, roof_y + 1, c.z), 0.35, M['SteelDark'])
    frame.finish()
    s = Builder(name)
    # Screen face, facing the pitch (towards -out), with UVs for the canvas.
    cs, sn = math.cos(yaw), math.sin(yaw)
    def SP(a, y):
        return (c.x + a * cs - 0.32 * sn, y, c.z - a * sn - 0.32 * cs)
    f = s.quad(SP(sc['width'] / 2, cy - sc['height'] / 2), SP(-sc['width'] / 2, cy - sc['height'] / 2),
               SP(-sc['width'] / 2, cy + sc['height'] / 2), SP(sc['width'] / 2, cy + sc['height'] / 2), M['Screen'])
    uv = s.bm.loops.layers.uv.new('UVMap')
    for loop, t in zip(f.loops, ((0, 0), (1, 0), (1, 1), (0, 1))):
        loop[uv].uv = t
    screen_objs.append(s.finish())

# ---- LED ribbons on the upper tier fascias (live texture in game) ----
for i, st in enumerate(s for s in stands if s['tiers'] == 2 and s['length'] > 40):
    L = st['length'] / 2
    r = Builder(f'LED_Ribbon_{i}')
    f = r.quad(P(st, -L, low_top + 1.05, up_d - 0.1), P(st, L, low_top + 1.05, up_d - 0.1), P(st, L, low_top + 2.15, up_d - 0.1), P(st, -L, low_top + 2.15, up_d - 0.1), M['LED'])
    uv = r.bm.loops.layers.uv.new('UVMap')
    for loop, t in zip(f.loops, ((0, 0), (st['length'] / 60, 0), (st['length'] / 60, 1), (0, 1))):
        loop[uv].uv = t
    r.finish()

# Ground outside the bowl.
ground = Builder('Ground')
G = 220
ground.quad((-G, -0.05, -G), (G, -0.05, -G), (G, -0.05, G), (-G, -0.05, G), M['Ground'])

for b in (stands_b, seats_b, aisle_b, rail_b, vom_b, conc_b, roof_b, glass_b, lamp_b, facade_b, mast_b, tun_b, dug_b, ground):
    b.finish()

# ----------------------------------------------------------------- lights & camera (for the .blend only)
sun = bpy.data.lights.new('Sun', 'SUN'); sun.energy = 3.0
so = bpy.data.objects.new('Sun', sun); so.rotation_euler = (math.radians(50), 0, math.radians(30)); scene.collection.objects.link(so)
camd = bpy.data.cameras.new('Broadcast'); camd.lens = 28
cam = bpy.data.objects.new('Broadcast', camd); cam.location = B((0, 32, 95)); scene.collection.objects.link(cam)
cam.rotation_euler = (math.radians(68), 0, 0)
scene.camera = cam

# ----------------------------------------------------------------- save + export
os.makedirs(os.path.dirname(BLEND), exist_ok=True)
os.makedirs(os.path.dirname(GLB), exist_ok=True)
bpy.ops.wm.save_as_mainfile(filepath=BLEND)
# Export only meshes (the game has its own lights and cameras).
for o in scene.objects:
    o.select_set(o.type == 'MESH')
bpy.ops.export_scene.gltf(filepath=GLB, export_format='GLB', use_selection=True, export_apply=True,
                          export_yup=True, export_lights=False, export_cameras=False)
tris = sum(len(o.data.polygons) for o in scene.objects if o.type == 'MESH')
print(f'[stadium] objects={sum(1 for o in scene.objects if o.type == "MESH")} faces={tris} -> {GLB}')
