import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { canvas } from '../render/textures.js';

// Shared materials for vehicles (created once).
let MATS = null;
export function vehicleMaterials() {
  if (MATS) return MATS;
  const tyreTex = tyreTexture();
  MATS = {
    chrome: new THREE.MeshStandardMaterial({ color: 0xd8dde2, metalness: 1, roughness: 0.18 }),
    alu: new THREE.MeshStandardMaterial({ color: 0xc2c8ce, metalness: 0.85, roughness: 0.32 }),
    black: new THREE.MeshStandardMaterial({ color: 0x17191b, metalness: 0.1, roughness: 0.7 }),
    plastic: new THREE.MeshStandardMaterial({ color: 0x2a2d30, metalness: 0.05, roughness: 0.55 }),
    chassis: new THREE.MeshStandardMaterial({ color: 0x1c1e20, metalness: 0.3, roughness: 0.6 }),
    tyre: new THREE.MeshStandardMaterial({ color: 0x1b1b1c, metalness: 0, roughness: 0.92, map: tyreTex }),
    rim: new THREE.MeshStandardMaterial({ color: 0xbfc4c8, metalness: 0.9, roughness: 0.25 }),
    glass: new THREE.MeshStandardMaterial({ color: 0x0d1a22, metalness: 0.2, roughness: 0.04, transparent: true, opacity: 0.72 }),
    glassDark: new THREE.MeshStandardMaterial({ color: 0x0a1115, metalness: 0.3, roughness: 0.05 }),
    // the same windows seen from the driver's seat: clear with a faint reflection
    glassInside: new THREE.MeshStandardMaterial({ color: 0x9fb4c2, metalness: 0.1, roughness: 0.05, transparent: true, opacity: 0.08, depthWrite: false }),
    headlight: new THREE.MeshStandardMaterial({ color: 0xe8eef2, metalness: 0.6, roughness: 0.1, emissive: 0xfff4dc, emissiveIntensity: 0 }),
    tail: new THREE.MeshStandardMaterial({ color: 0x5a0a08, metalness: 0.2, roughness: 0.3, emissive: 0xff2010, emissiveIntensity: 0.15 }),
    indicator: new THREE.MeshStandardMaterial({ color: 0x8a5a10, metalness: 0.2, roughness: 0.3, emissive: 0xff9a10, emissiveIntensity: 0 }),
    indicatorR: new THREE.MeshStandardMaterial({ color: 0x8a5a10, metalness: 0.2, roughness: 0.3, emissive: 0xff9a10, emissiveIntensity: 0 }),
    beacon: new THREE.MeshStandardMaterial({ color: 0xffa030, emissive: 0xff8a10, emissiveIntensity: 0.4, roughness: 0.3 }),
    interior: new THREE.MeshStandardMaterial({ color: 0x2b2e31, metalness: 0.05, roughness: 0.8 }),
    seat: new THREE.MeshStandardMaterial({ color: 0x3a3330, metalness: 0, roughness: 0.9 }),
    mirror: new THREE.MeshStandardMaterial({ color: 0xdfe6ec, metalness: 1, roughness: 0.02 }),
    reflector: new THREE.MeshStandardMaterial({ color: 0xff7a10, emissive: 0x401800, roughness: 0.4 }),
  };
  return MATS;
}

function tyreTexture() {
  const c = canvas(256, 64);
  const g = c.getContext('2d');
  g.fillStyle = '#1a1a1b';
  g.fillRect(0, 0, 256, 64);
  g.fillStyle = '#121213';
  for (let x = 0; x < 256; x += 12) {
    g.fillRect(x, 0, 5, 26);
    g.fillRect(x + 6, 38, 5, 26);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// Wheel facing +x (axle along x). Twin wheels for drive axles.
export function wheelMesh(radius = 0.52, width = 0.32, twin = false, hubColor = null) {
  const M = vehicleMaterials();
  const group = new THREE.Group();
  const tyreGeo = new THREE.CylinderGeometry(radius, radius, width, 28, 1, false);
  tyreGeo.rotateZ(Math.PI / 2);
  const sideGeo = new THREE.TorusGeometry(radius - 0.08, 0.075, 8, 28);
  sideGeo.rotateY(Math.PI / 2);
  const rimGeo = new THREE.CylinderGeometry(radius * 0.58, radius * 0.58, width * 0.4, 16);
  rimGeo.rotateZ(Math.PI / 2);
  const hubGeo = new THREE.CylinderGeometry(radius * 0.22, radius * 0.26, width * 0.55, 10);
  hubGeo.rotateZ(Math.PI / 2);
  const rimMat = hubColor ? new THREE.MeshStandardMaterial({ color: hubColor, metalness: 0.6, roughness: 0.35 }) : M.rim;
  const make = (offset) => {
    const t = new THREE.Mesh(tyreGeo, M.tyre);
    t.position.x = offset;
    const s1 = new THREE.Mesh(sideGeo, M.tyre);
    s1.position.x = offset + width / 2 - 0.04;
    const s2 = new THREE.Mesh(sideGeo, M.tyre);
    s2.position.x = offset - width / 2 + 0.04;
    const rim = new THREE.Mesh(rimGeo, rimMat);
    rim.position.x = offset + width * 0.32;
    const hub = new THREE.Mesh(hubGeo, M.chrome);
    hub.position.x = offset + width * 0.42;
    group.add(t, s1, s2, rim, hub);
  };
  if (twin) {
    make(width * 0.52);
    make(-width * 0.52);
  } else make(0);
  for (const m of group.children) {
    m.castShadow = true;
  }
  return group;
}

const rbox = (w, h, d, r = 0.08, seg = 3) => new RoundedBoxGeometry(w, h, d, seg, r);

// Cab-over European tractor unit. Forward = +z, origin at ground under the rear drive axle.
export function buildTractor(spec = {}) {
  const M = vehicleMaterials();
  const paint = new THREE.MeshStandardMaterial({ color: spec.color ?? 0xe9ebe8, metalness: 0.45, roughness: 0.28 });
  const accent = new THREE.MeshStandardMaterial({ color: spec.accent ?? 0x2b2f33, metalness: 0.3, roughness: 0.45 });
  const root = new THREE.Group();
  root.name = 'tractor';
  const body = new THREE.Group();
  root.add(body);
  const cabType = spec.cab ?? 'sokol';
  const wheelbase = 3.8;
  const front = wheelbase;
  const cabFront = front + 1.35;
  const cabLen = 2.35;
  const cabZ = cabFront - cabLen / 2;
  const cabBottom = 1.15;
  const cabH = cabType === 'atlant' ? 2.95 : cabType === 'buran' ? 2.75 : 2.55;
  const cabW = 2.48;
  const add = (geo, mat, x, y, z, parent = body, cast = true) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.castShadow = cast;
    m.receiveShadow = true;
    parent.add(m);
    return m;
  };
  // chassis rails and running gear
  add(new THREE.BoxGeometry(0.9, 0.28, 7.1), M.chassis, 0, 0.98, 1.45);
  add(new THREE.BoxGeometry(2.3, 0.2, 0.25), M.chassis, 0, 0.95, front + 0.2);
  // cab shell
  const shell = add(rbox(cabW, cabH, cabLen, 0.16, 4), paint, 0, cabBottom + cabH / 2, cabZ);
  shell.name = 'cab';
  // sloped front face panel (slight rake)
  const face = add(rbox(cabW - 0.04, cabH * 0.62, 0.14, 0.06), paint, 0, cabBottom + cabH * 0.3, cabFront - 0.02);
  face.rotation.x = -0.04;
  // windscreen
  const wsH = cabType === 'sokol' ? 0.95 : 1.02;
  const ws = add(new THREE.BoxGeometry(cabW - 0.22, wsH, 0.05), M.glassDark, 0, cabBottom + cabH * 0.66, cabFront + 0.035);
  ws.rotation.x = -0.12;
  const windows = [ws];
  // side windows and door outlines
  for (const s of [-1, 1]) {
    windows.push(add(new THREE.BoxGeometry(0.04, 0.78, 0.92), M.glassDark, s * (cabW / 2 + 0.005), cabBottom + cabH * 0.64, cabFront - 0.62));
    add(new THREE.BoxGeometry(0.035, 1.6, 0.03), M.black, s * (cabW / 2 + 0.01), cabBottom + 0.95, cabFront - 1.12, body, false);
    // steps
    add(new THREE.BoxGeometry(0.32, 0.06, 0.55), M.alu, s * (cabW / 2 - 0.12), 0.62, cabFront - 0.65);
    add(new THREE.BoxGeometry(0.32, 0.06, 0.55), M.alu, s * (cabW / 2 - 0.12), 0.95, cabFront - 0.65);
    // handle
    add(new THREE.BoxGeometry(0.03, 0.55, 0.04), M.chrome, s * (cabW / 2 + 0.04), cabBottom + 1.15, cabFront - 0.05);
    // mirror arm and mirrors
    const arm = add(new THREE.BoxGeometry(0.42, 0.04, 0.04), M.black, s * (cabW / 2 + 0.2), cabBottom + cabH * 0.72, cabFront - 0.02);
    arm.name = 'mirrorArm';
    const mirror = add(rbox(0.3, 0.62, 0.12, 0.03), M.black, s * (cabW / 2 + 0.42), cabBottom + cabH * 0.62, cabFront - 0.02);
    mirror.name = s < 0 ? 'mirrorL' : 'mirrorR';
    const glass = add(new THREE.PlaneGeometry(0.25, 0.55), M.mirror, s * (cabW / 2 + 0.42), cabBottom + cabH * 0.62, cabFront - 0.085, body, false);
    glass.rotation.y = Math.PI;
    glass.name = s < 0 ? 'mirrorGlassL' : 'mirrorGlassR';
    add(rbox(0.26, 0.24, 0.1, 0.03), M.black, s * (cabW / 2 + 0.4), cabBottom + cabH * 0.38, cabFront - 0.02);
    // side skirt / fairing behind cab
    add(rbox(0.06, 1.2, 1.1, 0.04), paint, s * (cabW / 2 - 0.05), cabBottom + cabH - 0.7, cabZ - cabLen / 2 - 0.45);
    // fuel tank and battery box
    const tankLen = 1.5;
    const tank = add(new THREE.CylinderGeometry(0.32, 0.32, tankLen, 18), M.alu, s * 1.0, 0.85, front - 2.1);
    tank.rotation.x = Math.PI / 2;
    add(new THREE.BoxGeometry(0.62, 0.55, 0.85), accent, s * 1.0, 0.88, front - 3.25);
    // mudguards over drive axle
    const guard = add(new THREE.BoxGeometry(0.62, 0.06, 1.25), M.black, s * 0.98, 1.18, 0);
    guard.rotation.x = 0.0;
    add(new THREE.BoxGeometry(0.6, 0.55, 0.03), M.black, s * 0.98, 0.85, -0.68);
    // front wheel arches
    add(new THREE.BoxGeometry(0.42, 0.06, 1.3), M.black, s * 1.02, 1.12, front);
  }
  // grille, bumper, lights
  const grille = add(new THREE.BoxGeometry(cabW * 0.62, cabH * 0.32, 0.06), M.black, 0, cabBottom + cabH * 0.33, cabFront + 0.05);
  grille.name = 'grille';
  for (let i = 0; i < 6; i++) add(new THREE.BoxGeometry(cabW * 0.6, 0.035, 0.04), cabType === 'atlant' ? M.chrome : accent, 0, cabBottom + cabH * 0.2 + i * 0.13, cabFront + 0.09, body, false);
  // emblem: abstract chevron (no real brand)
  const em = add(new THREE.CylinderGeometry(0.14, 0.14, 0.03, 3), M.chrome, 0, cabBottom + cabH * 0.5, cabFront + 0.1, body, false);
  em.rotation.x = Math.PI / 2;
  em.rotation.y = Math.PI;
  add(rbox(cabW + 0.02, 0.42, 0.42, 0.08), accent, 0, 0.82, cabFront + 0.05);
  add(new THREE.BoxGeometry(cabW - 0.4, 0.12, 0.2), M.black, 0, 0.6, cabFront + 0.12);
  const lights = [];
  for (const s of [-1, 1]) {
    const hl = add(rbox(0.52, 0.22, 0.08, 0.04), M.headlight, s * (cabW / 2 - 0.42), 0.9, cabFront + 0.26, body, false);
    hl.name = 'headlight';
    lights.push(hl);
    const ind = add(new THREE.BoxGeometry(0.16, 0.12, 0.06), s < 0 ? M.indicator : M.indicatorR, s * (cabW / 2 - 0.08), 0.9, cabFront + 0.24, body, false);
    ind.name = s < 0 ? 'indL' : 'indR';
    // fog lights
    add(new THREE.CylinderGeometry(0.07, 0.07, 0.05, 12), M.headlight, s * (cabW / 2 - 0.35), 0.66, cabFront + 0.27, body, false).rotation.x = Math.PI / 2;
  }
  // sun visor and roof
  add(new THREE.BoxGeometry(cabW - 0.1, 0.06, 0.38), accent, 0, cabBottom + cabH * 0.95 + 0.02, cabFront + 0.08);
  if (cabType !== 'sokol') {
    // roof marker lights
    for (let i = -2; i <= 2; i++) add(new THREE.BoxGeometry(0.09, 0.05, 0.05), M.beacon, i * 0.35, cabBottom + cabH + 0.02, cabFront - 0.05, body, false);
  }
  if (spec.lightBar) {
    const bar = add(new THREE.BoxGeometry(cabW - 0.3, 0.14, 0.12), M.chrome, 0, cabBottom + cabH + 0.1, cabFront - 0.15);
    for (let i = -3; i <= 3; i++) add(new THREE.CylinderGeometry(0.07, 0.07, 0.06, 12), M.headlight, i * 0.3, cabBottom + cabH + 0.12, cabFront - 0.07, body, false).rotation.x = Math.PI / 2;
    void bar;
  }
  // exhaust stack behind the cab
  add(new THREE.CylinderGeometry(0.08, 0.08, 1.6, 10), M.chrome, 0.95, cabBottom + cabH - 0.2, cabZ - cabLen / 2 - 0.25);
  // air horns on the roof
  for (const s of [-1, 1]) {
    const horn = add(new THREE.CylinderGeometry(0.04, 0.08, 0.5, 10), M.chrome, s * 0.4, cabBottom + cabH + 0.08, cabFront - 0.6);
    horn.rotation.x = Math.PI / 2;
  }
  // fifth wheel coupling plate
  add(new THREE.CylinderGeometry(0.45, 0.45, 0.12, 20), M.black, 0, 1.2, 0.35);
  // rear lights on chassis end
  for (const s of [-1, 1]) {
    const tl = add(new THREE.BoxGeometry(0.3, 0.12, 0.05), M.tail, s * 0.9, 1.0, -1.95, body, false);
    tl.name = 'tail';
  }
  // wheels
  const wheels = [];
  const fw = [];
  for (const s of [-1, 1]) {
    const f = wheelMesh(0.52, 0.32, false);
    f.position.set(s * 1.02, 0.52, front);
    if (s < 0) f.rotation.y = Math.PI;
    root.add(f);
    fw.push(f);
    wheels.push(f);
    const r = wheelMesh(0.52, 0.28, true);
    r.position.set(s * 0.92, 0.52, 0);
    if (s < 0) r.rotation.y = Math.PI;
    root.add(r);
    wheels.push(r);
  }
  // interior (visible from the driver seat)
  const interior = buildInterior(cabW, cabBottom, cabH, cabFront);
  body.add(interior.group);
  return {
    root,
    body,
    wheels,
    frontWheels: fw,
    paint,
    lights,
    interior,
    windows,
    eye: new THREE.Vector3(-0.55, cabBottom + 1.55, cabFront - 0.95),
    mirrorL: body.getObjectByName('mirrorGlassL'),
    mirrorR: body.getObjectByName('mirrorGlassR'),
    hitchZ: 0.35,
    length: cabFront + 2.05,
    cabFront,
    cabTop: cabBottom + cabH,
  };
}

function buildInterior(cabW, cabBottom, cabH, cabFront) {
  const M = vehicleMaterials();
  const group = new THREE.Group();
  group.name = 'interior';
  const add = (geo, mat, x, y, z) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    group.add(m);
    return m;
  };
  const floorY = cabBottom + 0.15;
  // dashboard
  const dash = add(rbox(cabW - 0.2, 0.42, 0.6, 0.08), M.interior, 0, floorY + 0.95, cabFront - 0.45);
  dash.name = 'dash';
  add(rbox(0.8, 0.3, 0.35, 0.06), M.interior, -0.5, floorY + 1.18, cabFront - 0.5);
  // instrument faces as canvas texture
  const gauges = gaugeCanvas();
  const gaugeTex = new THREE.CanvasTexture(gauges.canvas);
  gaugeTex.colorSpace = THREE.SRGBColorSpace;
  const gaugeMat = new THREE.MeshStandardMaterial({ map: gaugeTex, emissive: 0xffffff, emissiveMap: gaugeTex, emissiveIntensity: 0.25, roughness: 0.6 });
  const panel = add(new THREE.PlaneGeometry(0.66, 0.24), gaugeMat, -0.5, floorY + 1.17, cabFront - 0.67);
  panel.rotation.y = Math.PI;
  panel.rotation.x = -0.35;
  // steering wheel
  const wheel = new THREE.Group();
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.23, 0.022, 10, 32), M.black);
  wheel.add(rim);
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.06, 16), M.black);
  hub.rotation.x = Math.PI / 2;
  wheel.add(hub);
  for (let i = 0; i < 3; i++) {
    const spoke = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.025, 0.02), M.black);
    spoke.position.set(Math.cos((i * Math.PI * 2) / 3 - Math.PI / 2) * 0.11, Math.sin((i * Math.PI * 2) / 3 - Math.PI / 2) * 0.11, 0);
    spoke.rotation.z = (i * Math.PI * 2) / 3 - Math.PI / 2;
    wheel.add(spoke);
  }
  wheel.position.set(-0.55, floorY + 1.1, cabFront - 0.86);
  wheel.rotation.x = -0.6;
  wheel.name = 'steering';
  group.add(wheel);
  const column = add(new THREE.CylinderGeometry(0.035, 0.035, 0.45, 8), M.black, -0.55, floorY + 0.95, cabFront - 0.72);
  column.rotation.x = 0.95;
  // seats
  for (const s of [-1, 1]) {
    add(rbox(0.55, 0.16, 0.55, 0.05), M.seat, s * 0.55, floorY + 0.5, cabFront - 1.35);
    const back = add(rbox(0.55, 0.85, 0.14, 0.05), M.seat, s * 0.55, floorY + 1.0, cabFront - 1.65);
    back.rotation.x = 0.12;
  }
  // bunk and rear wall
  add(new THREE.BoxGeometry(cabW - 0.12, 0.08, 0.7), M.seat, 0, floorY + 0.7, cabFront - 2.0);
  add(new THREE.BoxGeometry(cabW - 0.1, cabH - 0.2, 0.05), M.interior, 0, cabBottom + cabH / 2, cabFront - 2.3);
  // A-pillars and roof liner
  for (const s of [-1, 1]) {
    const p = add(new THREE.BoxGeometry(0.08, 1.15, 0.1), M.interior, s * (cabW / 2 - 0.08), cabBottom + cabH * 0.66, cabFront - 0.04);
    p.rotation.x = -0.12;
  }
  add(new THREE.BoxGeometry(cabW - 0.1, 0.05, 2.2), M.interior, 0, cabBottom + cabH - 0.08, cabFront - 1.2);
  add(new THREE.BoxGeometry(cabW - 0.1, 0.06, 2.3), M.interior, 0, floorY, cabFront - 1.2);
  // inner door panels so the cab is not see-through
  for (const s of [-1, 1]) {
    add(new THREE.BoxGeometry(0.04, 0.9, 1.9), M.interior, s * (cabW / 2 - 0.06), floorY + 0.5, cabFront - 1.2);
    add(new THREE.BoxGeometry(0.04, cabH * 0.3, 1.3), M.interior, s * (cabW / 2 - 0.06), cabBottom + cabH * 0.86, cabFront - 1.6);
  }
  group.visible = false;
  return { group, wheel, gauges, gaugeTex };
}

function gaugeCanvas() {
  const c = canvas(512, 192);
  return { canvas: c, ctx: c.getContext('2d') };
}

// Draws speedometer, tachometer and fuel/air indicators onto the dashboard texture.
export function drawGauges(interior, speedKmh, rpm, fuel, lights) {
  const { ctx: g, canvas: c } = interior.gauges;
  g.fillStyle = '#0c0e10';
  g.fillRect(0, 0, c.width, c.height);
  const dial = (cx, cy, r, value, max, label, ticks) => {
    g.strokeStyle = '#2b3036';
    g.lineWidth = 6;
    g.beginPath();
    g.arc(cx, cy, r, Math.PI * 0.75, Math.PI * 2.25);
    g.stroke();
    g.strokeStyle = '#e8e6df';
    g.lineWidth = 2;
    g.font = 'bold 14px Arial';
    g.fillStyle = '#e8e6df';
    g.textAlign = 'center';
    for (let i = 0; i <= ticks; i++) {
      const a = Math.PI * 0.75 + (i / ticks) * Math.PI * 1.5;
      g.beginPath();
      g.moveTo(cx + Math.cos(a) * (r - 4), cy + Math.sin(a) * (r - 4));
      g.lineTo(cx + Math.cos(a) * (r - 14), cy + Math.sin(a) * (r - 14));
      g.stroke();
      g.fillText(String(Math.round((max * i) / ticks / (label === 'x100' ? 100 : 1))), cx + Math.cos(a) * (r - 28), cy + Math.sin(a) * (r - 28) + 5);
    }
    const a = Math.PI * 0.75 + Math.min(1, value / max) * Math.PI * 1.5;
    g.strokeStyle = '#ff5a2a';
    g.lineWidth = 4;
    g.beginPath();
    g.moveTo(cx, cy);
    g.lineTo(cx + Math.cos(a) * (r - 10), cy + Math.sin(a) * (r - 10));
    g.stroke();
    g.font = '11px Arial';
    g.fillStyle = '#9aa3aa';
    g.fillText(label, cx, cy + r * 0.55);
  };
  dial(100, 98, 82, speedKmh, 125, 'км/ч', 5);
  dial(412, 98, 82, rpm, 2500, 'x100', 5);
  g.fillStyle = '#e8e6df';
  g.font = 'bold 30px Arial';
  g.textAlign = 'center';
  g.fillText(String(Math.round(speedKmh)), 256, 92);
  g.fillStyle = '#2b3036';
  g.fillRect(206, 120, 100, 10);
  g.fillStyle = fuel < 0.15 ? '#ff7a2a' : '#7fd17f';
  g.fillRect(206, 120, 100 * Math.max(0, Math.min(1, fuel)), 10);
  if (lights) {
    g.fillStyle = '#3fb3ff';
    g.fillRect(244, 140, 24, 10);
  }
  interior.gaugeTex.needsUpdate = true;
}
