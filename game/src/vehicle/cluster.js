// Instrument cluster of the lineup trucks, drawn into the canvas mapped on the cluster quad (1024 x 320).
// Two dials (speed, engine speed) with a colour display between them; static parts are drawn once.
const W = 1024;
const H = 320;
const SPEED = { cx: 186, cy: 166, r: 146, max: 125, a0: Math.PI * 0.78, a1: Math.PI * 2.22 };
const TACHO = { cx: W - 186, cy: 166, r: 146, max: 2500, a0: Math.PI * 0.78, a1: Math.PI * 2.22 };
const FONT = "'Source Sans', Arial, sans-serif";

const angle = (d, v) => d.a0 + Math.max(0, Math.min(1, v / d.max)) * (d.a1 - d.a0);

function dialFace(g, d, major, minor, label, bands) {
  const { cx, cy, r } = d;
  // bezel: a thin metallic ring and a deep face
  const ring = g.createLinearGradient(cx, cy - r, cx, cy + r);
  ring.addColorStop(0, '#8d949b');
  ring.addColorStop(0.5, '#2a2e33');
  ring.addColorStop(1, '#6f767d');
  g.beginPath();
  g.arc(cx, cy, r + 8, 0, Math.PI * 2);
  g.fillStyle = ring;
  g.fill();
  const face = g.createRadialGradient(cx, cy - r * 0.3, r * 0.1, cx, cy, r);
  face.addColorStop(0, '#1b1f24');
  face.addColorStop(1, '#07090b');
  g.beginPath();
  g.arc(cx, cy, r, 0, Math.PI * 2);
  g.fillStyle = face;
  g.fill();
  for (const [from, to, colour] of bands) {
    g.beginPath();
    g.arc(cx, cy, r - 9, angle(d, from), angle(d, to));
    g.strokeStyle = colour;
    g.lineWidth = 7;
    g.stroke();
  }
  g.lineCap = 'butt';
  for (let v = 0; v <= d.max + 1e-6; v += minor) {
    const a = angle(d, v);
    const big = Math.abs(v / major - Math.round(v / major)) < 1e-6;
    const r0 = r - (big ? 26 : 16);
    g.beginPath();
    g.moveTo(cx + Math.cos(a) * (r - 4), cy + Math.sin(a) * (r - 4));
    g.lineTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0);
    g.strokeStyle = big ? '#f2f2ee' : '#a9adb1';
    g.lineWidth = big ? 4 : 2;
    g.stroke();
  }
  g.fillStyle = '#f4f4f0';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = `600 30px ${FONT}`;
  const step = major * (d.max > 500 ? 2 : 2);
  for (let v = 0; v <= d.max + 1e-6; v += step) {
    const a = angle(d, v);
    const rr = r - 50;
    g.fillText(d.max > 500 ? String(v / 100) : String(v), cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
  }
  g.fillStyle = '#8e959b';
  g.font = `500 20px ${FONT}`;
  g.fillText(label, cx, cy + r * 0.42);
}

function background() {
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d');
  const bg = g.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#0b0d10');
  bg.addColorStop(1, '#040506');
  g.fillStyle = bg;
  g.fillRect(0, 0, W, H);
  dialFace(g, SPEED, 10, 5, 'км/ч', [[90, 125, 'rgba(210,60,40,0.85)']]);
  dialFace(g, TACHO, 500, 100, 'об/мин ×100', [[1000, 1500, 'rgba(60,170,90,0.9)'], [2100, 2500, 'rgba(210,60,40,0.85)']]);
  // centre display frame
  const x0 = 368;
  const x1 = W - 368;
  g.fillStyle = '#020304';
  roundRect(g, x0, 34, x1 - x0, 252, 14);
  g.fill();
  g.strokeStyle = '#2b3036';
  g.lineWidth = 3;
  g.stroke();
  return c;
}

function roundRect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

function needle(g, d, v, colour) {
  const a = angle(d, v);
  const { cx, cy, r } = d;
  g.save();
  g.translate(cx, cy);
  g.rotate(a);
  g.shadowColor = colour;
  g.shadowBlur = 10;
  g.beginPath();
  g.moveTo(-22, -4);
  g.lineTo(r - 18, -1.5);
  g.lineTo(r - 18, 1.5);
  g.lineTo(-22, 4);
  g.closePath();
  g.fillStyle = colour;
  g.fill();
  g.restore();
  const hub = g.createRadialGradient(cx - 5, cy - 5, 2, cx, cy, 24);
  hub.addColorStop(0, '#5a6067');
  hub.addColorStop(1, '#14171a');
  g.beginPath();
  g.arc(cx, cy, 22, 0, Math.PI * 2);
  g.fillStyle = hub;
  g.fill();
}

function arrow(g, x, y, dir, on) {
  g.beginPath();
  g.moveTo(x + dir * 18, y);
  g.lineTo(x, y - 14);
  g.lineTo(x, y - 6);
  g.lineTo(x - dir * 14, y - 6);
  g.lineTo(x - dir * 14, y + 6);
  g.lineTo(x, y + 6);
  g.lineTo(x, y + 14);
  g.closePath();
  g.fillStyle = on ? '#38e06a' : '#14321d';
  g.fill();
}

function lamp(g, x, y, colour, on, draw) {
  g.save();
  g.translate(x, y);
  g.strokeStyle = on ? colour : '#1d2125';
  g.fillStyle = on ? colour : '#1d2125';
  g.lineWidth = 3;
  draw(g);
  g.restore();
}

let BG = null;

export function drawCluster(interior, s) {
  const { ctx: g } = interior.gauges;
  if (!BG) BG = background();
  g.drawImage(BG, 0, 0);
  // fuel and air in arcs inside the dials
  const arc = (d, frac, colour, from, to) => {
    g.beginPath();
    g.arc(d.cx, d.cy, d.r * 0.52, from, to);
    g.strokeStyle = '#1e2328';
    g.lineWidth = 8;
    g.stroke();
    g.beginPath();
    g.arc(d.cx, d.cy, d.r * 0.52, from, from + (to - from) * Math.max(0, Math.min(1, frac)));
    g.strokeStyle = colour;
    g.stroke();
  };
  arc(SPEED, s.fuel, s.fuel < 0.12 ? '#ff7a2a' : '#e9ecef', Math.PI * 0.2, Math.PI * 0.8);
  arc(TACHO, s.air ?? 0.85, '#e9ecef', Math.PI * 0.2, Math.PI * 0.8);
  needle(g, SPEED, s.speed, '#ff4a1c');
  needle(g, TACHO, s.rpm, '#ff4a1c');
  // centre display
  const cx = W / 2;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillStyle = '#f2f4f5';
  g.font = `600 84px ${FONT}`;
  g.fillText(String(Math.round(s.speed)), cx, 122);
  g.font = `500 22px ${FONT}`;
  g.fillStyle = '#8f979e';
  g.fillText('км/ч', cx, 172);
  g.textAlign = 'left';
  g.font = `600 34px ${FONT}`;
  g.fillStyle = '#9fd3ff';
  g.fillText(s.gear, 392, 78);
  g.textAlign = 'right';
  g.font = `500 24px ${FONT}`;
  g.fillStyle = '#d6dadd';
  g.fillText(s.clock, W - 392, 78);
  // cruise and retarder
  g.textAlign = 'left';
  g.font = `500 22px ${FONT}`;
  if (s.cruise) {
    g.fillStyle = '#38e06a';
    g.fillText(`⟳ ${Math.round(s.cruise)}`, 392, 214);
  }
  if (s.retarder) {
    g.fillStyle = '#9fd3ff';
    g.fillText(`R${s.retarder}`, 392, 248);
  }
  g.textAlign = 'right';
  g.fillStyle = '#c3c8cc';
  g.fillText(`${Math.round(s.odo).toLocaleString('ru-RU')} км`, W - 392, 248);
  g.fillText(`${s.range} км`, W - 392, 214);
  // warning and indicator lamps along the top
  arrow(g, 420, 22, -1, s.left);
  arrow(g, W - 420, 22, 1, s.right);
  lamp(g, 470, 22, '#2f8bff', s.high, (c) => {
    c.beginPath();
    c.arc(4, 0, 9, -Math.PI / 2, Math.PI / 2);
    c.stroke();
    for (let i = -1; i <= 1; i++) {
      c.beginPath();
      c.moveTo(-4, i * 6);
      c.lineTo(-16, i * 6);
      c.stroke();
    }
  });
  lamp(g, 520, 22, '#38e06a', s.lights, (c) => {
    c.beginPath();
    c.arc(4, 0, 9, -Math.PI / 2, Math.PI / 2);
    c.stroke();
    for (let i = -1; i <= 1; i++) {
      c.beginPath();
      c.moveTo(-4, i * 6);
      c.lineTo(-16, i * 6 + 4);
      c.stroke();
    }
  });
  lamp(g, 572, 22, '#ff3b2f', s.parking, (c) => {
    c.beginPath();
    c.arc(0, 0, 13, 0, Math.PI * 2);
    c.stroke();
    c.font = `700 16px ${FONT}`;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText('P', 0, 1);
  });
  lamp(g, 618, 22, '#ffb12a', s.damage, (c) => {
    c.beginPath();
    c.moveTo(0, -13);
    c.lineTo(13, 11);
    c.lineTo(-13, 11);
    c.closePath();
    c.stroke();
    c.font = `700 14px ${FONT}`;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText('!', 0, 3);
  });
  interior.gaugeTex.needsUpdate = true;
}
