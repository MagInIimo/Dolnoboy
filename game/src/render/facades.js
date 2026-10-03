import { canvas, tileNoise } from './textures.js';
import { rng } from '../core/util.js';

// Each facade tile covers 4 bays x 4 floors. Colour canvas + window mask canvas (white = glass).
export const FACADES = [
  'panelWhite', 'panelBeige', 'panelTower', 'khrushchevka', 'khrushchevkaBrick', 'redBrick', 'stalinkaYellow', 'stalinkaPeach',
  'merchant', 'modernResidential', 'glassBlue', 'glassDark', 'logWall', 'siding', 'shopfront', 'metalShed',
  'factoryBrick', 'concrete', 'roofTin', 'roofTinRed', 'roofFlat', 'roofSlate', 'garageDoors', 'warehouseDock',
  'kremlinBrick', 'whiteStone', 'school', 'balconyStack', 'gold', 'stadium', 'plasterWhite', 'tvTower',
  'woodFence', 'profFence', 'door', 'signRed',
];
export const F = Object.fromEntries(FACADES.map((n, i) => [n, i]));

// PBR hints per layer: [roughness wall, roughness glass, metalness wall]
export const FACADE_PBR = {
  glassBlue: [0.25, 0.08, 0.4], glassDark: [0.25, 0.06, 0.45], roofTin: [0.55, 0.5, 0.45], roofTinRed: [0.55, 0.5, 0.4], metalShed: [0.6, 0.3, 0.35],
  gold: [0.28, 0.28, 1.0], garageDoors: [0.7, 0.5, 0.3], warehouseDock: [0.75, 0.3, 0.25], stadium: [0.6, 0.3, 0.1], tvTower: [0.7, 0.3, 0.2],
};

const S = 512;
const C = 128;

function setup(seed) {
  const color = canvas(S);
  const mask = canvas(S);
  const g = color.getContext('2d', { willReadFrequently: true });
  const m = mask.getContext('2d', { willReadFrequently: true });
  m.fillStyle = '#000';
  m.fillRect(0, 0, S, S);
  return { color, mask, g, m, r: rng(seed) };
}

function grain(g, amount, seed, scale = 6, tint = [0, 0, 0]) {
  const n = tileNoise(S, scale, seed, 4);
  const img = g.getImageData(0, 0, S, S);
  for (let i = 0; i < S * S; i++) {
    const k = (n[i] - 0.5) * amount;
    img.data[i * 4] = Math.max(0, Math.min(255, img.data[i * 4] + k + tint[0]));
    img.data[i * 4 + 1] = Math.max(0, Math.min(255, img.data[i * 4 + 1] + k + tint[1]));
    img.data[i * 4 + 2] = Math.max(0, Math.min(255, img.data[i * 4 + 2] + k + tint[2]));
  }
  g.putImageData(img, 0, 0);
}

function streaks(g, r, alpha = 0.08) {
  for (let i = 0; i < 70; i++) {
    const x = r() * S;
    const y = r() * S;
    const h = 20 + r() * 90;
    const grad = g.createLinearGradient(x, y, x, y + h);
    grad.addColorStop(0, `rgba(40,38,34,${alpha})`);
    grad.addColorStop(1, 'rgba(40,38,34,0)');
    g.fillStyle = grad;
    g.fillRect(x, y, 2 + r() * 6, h);
  }
}

const CURTAINS = ['#e9e1cf', '#d9cfb8', '#c9b48e', '#f1ebe0', '#b9a07a', '#a8bcc4', '#d8c3c3', '#c7d1b6', '#efe3c4'];

// Soviet three-pane window: two sashes + transom (fortochka), white frames.
function window3(g, m, r, x, y, w, h, frame = '#ecebe6', opts = {}) {
  const glassTop = opts.glassTop ?? '#566573';
  const glassBottom = opts.glassBottom ?? '#2a333b';
  g.fillStyle = opts.reveal ?? 'rgba(0,0,0,0.25)';
  g.fillRect(x - 3, y - 3, w + 6, h + 7);
  const grad = g.createLinearGradient(x, y, x + w * 0.3, y + h);
  grad.addColorStop(0, glassTop);
  grad.addColorStop(1, glassBottom);
  g.fillStyle = grad;
  g.fillRect(x, y, w, h);
  // curtains / interior
  if (r() < 0.75) {
    g.fillStyle = CURTAINS[Math.floor(r() * CURTAINS.length)];
    g.globalAlpha = 0.55 + r() * 0.3;
    const cw = w * (0.18 + r() * 0.3);
    g.fillRect(x + 2, y + 4, cw, h - 6);
    if (r() < 0.7) g.fillRect(x + w - cw - 2, y + 4, cw, h - 6);
    if (r() < 0.4) {
      g.fillStyle = '#f4f2ea';
      g.globalAlpha = 0.35;
      g.fillRect(x + 2, y + 4, w - 4, h * 0.45);
    }
    g.globalAlpha = 1;
  }
  m.fillStyle = '#fff';
  m.fillRect(x, y, w, h);
  g.strokeStyle = frame;
  g.lineWidth = opts.frameWidth ?? 3;
  g.strokeRect(x + 1, y + 1, w - 2, h - 2);
  const mid = x + w * (opts.split ?? 0.5);
  g.beginPath();
  g.moveTo(mid, y);
  g.lineTo(mid, y + h);
  if (opts.transom !== false) {
    g.moveTo(x, y + h * 0.3);
    g.lineTo(mid, y + h * 0.3);
  }
  g.stroke();
  m.fillStyle = '#000';
  m.fillRect(mid - 1, y, 3, h);
  // sill
  g.fillStyle = opts.sill ?? '#bdbab2';
  g.fillRect(x - 4, y + h, w + 8, 4);
}

function painters() {
  return {
    panelWhite(seed) {
      const p = setup(seed);
      const { g, m, r } = p;
      g.fillStyle = '#d7d6cf';
      g.fillRect(0, 0, S, S);
      grain(g, 26, seed, 8);
      // panel seams
      g.fillStyle = 'rgba(60,60,58,0.55)';
      for (let i = 0; i <= 4; i++) {
        g.fillRect(0, i * C - 1, S, 3);
        g.fillRect(i * C - 1, 0, 3, S);
      }
      for (let fy = 0; fy < 4; fy++) {
        for (let bx = 0; bx < 4; bx++) {
          const x = bx * C;
          const y = fy * C;
          window3(g, m, r, x + 30, y + 30, 68, 64);
        }
      }
      streaks(g, r, 0.07);
      return p;
    },
    panelBeige(seed) {
      const p = setup(seed);
      const { g, m, r } = p;
      g.fillStyle = '#d9c9ad';
      g.fillRect(0, 0, S, S);
      grain(g, 22, seed, 8);
      g.fillStyle = 'rgba(70,62,52,0.5)';
      for (let i = 0; i <= 4; i++) {
        g.fillRect(0, i * C - 1, S, 3);
        g.fillRect(i * C * 2 - 1, 0, 3, S);
      }
      // pinkish stripe band under windows (typical 1980s colour accents)
      for (let fy = 0; fy < 4; fy++) {
        g.fillStyle = 'rgba(176,112,92,0.35)';
        g.fillRect(0, fy * C + 108, S, 14);
        for (let bx = 0; bx < 4; bx++) window3(g, m, r, bx * C + 26, fy * C + 26, 76, 66);
      }
      streaks(g, r, 0.06);
      return p;
    },
    panelTower(seed) {
      // P-44 style: white tile with blue/terracotta vertical accents and bay windows
      const p = setup(seed);
      const { g, m, r } = p;
      g.fillStyle = '#e4e3dd';
      g.fillRect(0, 0, S, S);
      grain(g, 18, seed, 10);
      for (let y = 0; y < S; y += 8) {
        g.fillStyle = 'rgba(0,0,0,0.05)';
        g.fillRect(0, y, S, 1);
      }
      g.fillStyle = '#5a7fae';
      g.fillRect(0, 0, 18, S);
      g.fillRect(S - 18, 0, 18, S);
      g.fillStyle = 'rgba(70,70,70,0.45)';
      for (let i = 0; i <= 4; i++) g.fillRect(0, i * C - 1, S, 3);
      for (let fy = 0; fy < 4; fy++) {
        for (let bx = 0; bx < 4; bx++) {
          const wide = bx === 1 || bx === 2;
          window3(g, m, r, bx * C + (wide ? 22 : 34), fy * C + 28, wide ? 84 : 60, 66);
        }
      }
      return p;
    },
    khrushchevka(seed) {
      // light grey large panels with blue-ish tile infill: series 1-464 / 1-335
      const p = setup(seed);
      const { g, m, r } = p;
      g.fillStyle = '#c9cbc6';
      g.fillRect(0, 0, S, S);
      grain(g, 30, seed, 7);
      // small square tiles texture
      for (let y = 0; y < S; y += 6) {
        for (let x = 0; x < S; x += 6) {
          if (r() < 0.12) {
            g.fillStyle = `rgba(${150 + r() * 40},${160 + r() * 40},${170 + r() * 40},0.35)`;
            g.fillRect(x, y, 5, 5);
          }
        }
      }
      g.fillStyle = 'rgba(55,55,52,0.6)';
      for (let i = 0; i <= 4; i++) {
        g.fillRect(0, i * C - 1, S, 3);
        g.fillRect(i * C * 2 - 1, 0, 3, S);
      }
      for (let fy = 0; fy < 4; fy++) for (let bx = 0; bx < 4; bx++) window3(g, m, r, bx * C + 28, fy * C + 34, 72, 62, '#e8e6df');
      streaks(g, r, 0.1);
      return p;
    },
    khrushchevkaBrick(seed) {
      // white silicate brick five-storey
      const p = setup(seed);
      const { g, m, r } = p;
      g.fillStyle = '#d9d5ca';
      g.fillRect(0, 0, S, S);
      for (let y = 0; y < S; y += 8) {
        const off = (y / 8) % 2 ? 0 : 12;
        for (let x = -24; x < S; x += 24) {
          const v = 208 + r() * 26;
          g.fillStyle = `rgb(${v},${v - 4},${v - 12})`;
          g.fillRect(x + off + 1, y + 1, 22, 6);
        }
      }
      grain(g, 18, seed, 6);
      for (let fy = 0; fy < 4; fy++) for (let bx = 0; bx < 4; bx++) window3(g, m, r, bx * C + 30, fy * C + 32, 68, 64, '#ecebe5', { sill: '#9a978f' });
      streaks(g, r, 0.08);
      return p;
    },
    redBrick(seed) {
      const p = setup(seed);
      const { g, m, r } = p;
      g.fillStyle = '#7d3b2c';
      g.fillRect(0, 0, S, S);
      for (let y = 0; y < S; y += 8) {
        const off = (y / 8) % 2 ? 0 : 12;
        for (let x = -24; x < S; x += 24) {
          const v = r();
          g.fillStyle = `rgb(${130 + v * 40},${58 + v * 22},${44 + v * 14})`;
          g.fillRect(x + off + 1, y + 1, 22, 6);
        }
      }
      grain(g, 16, seed, 6);
      for (let fy = 0; fy < 4; fy++) {
        for (let bx = 0; bx < 4; bx++) {
          const x = bx * C + 32;
          const y = fy * C + 30;
          g.fillStyle = '#6b2f22';
          g.fillRect(x - 6, y - 10, 76, 8);
          window3(g, m, r, x, y, 64, 70, '#efede6', { sill: '#5d554c' });
        }
      }
      return p;
    },
    stalinkaYellow(seed) {
      return stalinka(seed, '#d8b46c', '#efe6cf');
    },
    stalinkaPeach(seed) {
      return stalinka(seed, '#cf9b7d', '#f0e2d2');
    },
    merchant(seed) {
      const p = setup(seed);
      const { g, m, r } = p;
      const colors = ['#c8a14e', '#b9706a', '#8eb0a0', '#d4c09a', '#9fb6cc'];
      g.fillStyle = colors[Math.floor(r() * colors.length)];
      g.fillRect(0, 0, S, S);
      grain(g, 24, seed, 6);
      for (let fy = 0; fy < 4; fy++) {
        g.fillStyle = '#f2ece0';
        g.fillRect(0, fy * C + C - 10, S, 8);
        for (let bx = 0; bx < 4; bx++) {
          const x = bx * C + 36;
          const y = fy * C + 22;
          // pediment (sandrik) and decorative surround
          g.fillStyle = '#f4efe4';
          g.beginPath();
          g.moveTo(x - 10, y - 4);
          g.lineTo(x + 28, y - 20);
          g.lineTo(x + 66, y - 4);
          g.fill();
          g.fillRect(x - 8, y - 4, 72, 90);
          window3(g, m, r, x, y, 56, 80, '#ffffff', { reveal: 'rgba(0,0,0,0.1)' });
          g.fillStyle = '#f4efe4';
          g.fillRect(x + 6, y + 86, 44, 10);
        }
      }
      return p;
    },
    modernResidential(seed) {
      const p = setup(seed);
      const { g, m, r } = p;
      const palette = ['#e9e6e0', '#d5d0c8', '#a9a39a', '#c86f43', '#e2a35a', '#7f8c99'];
      for (let fy = 0; fy < 4; fy++) {
        for (let bx = 0; bx < 4; bx++) {
          g.fillStyle = palette[Math.floor(r() * palette.length)];
          g.fillRect(bx * C, fy * C, C, C);
        }
      }
      grain(g, 14, seed, 10);
      for (let fy = 0; fy < 4; fy++) {
        for (let bx = 0; bx < 4; bx++) {
          const x = bx * C + 14;
          const y = fy * C + 14;
          const grad = g.createLinearGradient(x, y, x + 60, y + 100);
          grad.addColorStop(0, '#7f97ab');
          grad.addColorStop(1, '#2d3a45');
          g.fillStyle = grad;
          g.fillRect(x, y, 100, 92);
          m.fillStyle = '#fff';
          m.fillRect(x, y, 100, 92);
          g.strokeStyle = '#3c3f43';
          g.lineWidth = 4;
          g.strokeRect(x, y, 100, 92);
          g.beginPath();
          g.moveTo(x + 50, y);
          g.lineTo(x + 50, y + 92);
          g.stroke();
          if (r() < 0.6) {
            g.fillStyle = CURTAINS[Math.floor(r() * CURTAINS.length)];
            g.globalAlpha = 0.45;
            g.fillRect(x + 4, y + 4, 30, 84);
            g.globalAlpha = 1;
          }
          g.fillStyle = 'rgba(30,30,30,0.6)';
          g.fillRect(x, y + 70, 100, 3);
        }
      }
      return p;
    },
    glassBlue(seed) {
      return glass(seed, ['#6d8fa8', '#2e4a60'], '#9fb0bd');
    },
    glassDark(seed) {
      return glass(seed, ['#5d6670', '#1d242b'], '#3a4048');
    },
    logWall(seed) {
      const p = setup(seed);
      const { g, m, r } = p;
      // horizontal logs
      for (let y = 0; y < S; y += 21) {
        const v = 0.75 + r() * 0.25;
        const grad = g.createLinearGradient(0, y, 0, y + 21);
        grad.addColorStop(0, `rgb(${Math.round(120 * v)},${Math.round(92 * v)},${Math.round(62 * v)})`);
        grad.addColorStop(0.5, `rgb(${Math.round(150 * v)},${Math.round(116 * v)},${Math.round(80 * v)})`);
        grad.addColorStop(1, `rgb(${Math.round(70 * v)},${Math.round(52 * v)},${Math.round(36 * v)})`);
        g.fillStyle = grad;
        g.fillRect(0, y, S, 21);
      }
      grain(g, 30, seed, 16, [-8, -10, -12]);
      // carved white window frames (nalichniki) with blue shutters
      const shutter = ['#3d6fa3', '#4f8a5a', '#2f5b8a', '#8a3f3a'][Math.floor(r() * 4)];
      for (let fy = 0; fy < 4; fy++) {
        for (let bx = 0; bx < 4; bx++) {
          const x = bx * C + 38;
          const y = fy * C + 30;
          g.fillStyle = shutter;
          g.fillRect(x - 24, y - 2, 18, 74);
          g.fillRect(x + 58, y - 2, 18, 74);
          g.fillStyle = '#f3f0e8';
          g.fillRect(x - 6, y - 8, 64, 86);
          // carved crest
          g.beginPath();
          g.moveTo(x - 10, y - 8);
          for (let k = 0; k <= 8; k++) g.lineTo(x - 10 + k * 9, y - 8 - (k % 2 ? 14 : 6) - (k === 4 ? 10 : 0));
          g.lineTo(x + 62, y - 8);
          g.fill();
          for (let k = 0; k < 6; k++) {
            g.fillStyle = shutter;
            g.fillRect(x + 2 + k * 9, y - 16, 4, 4);
          }
          g.fillStyle = '#f3f0e8';
          g.fillRect(x - 8, y + 72, 68, 10);
          window3(g, m, r, x, y, 52, 66, '#f6f4ee', { reveal: 'rgba(0,0,0,0.0)', frameWidth: 4 });
        }
      }
      return p;
    },
    siding(seed) {
      const p = setup(seed);
      const { g, m, r } = p;
      const col = ['#d7c79a', '#a9bfa5', '#cfd6dc', '#e4d8bf', '#b8c9d9'][Math.floor(r() * 5)];
      g.fillStyle = col;
      g.fillRect(0, 0, S, S);
      for (let y = 0; y < S; y += 16) {
        g.fillStyle = 'rgba(0,0,0,0.12)';
        g.fillRect(0, y + 13, S, 3);
        g.fillStyle = 'rgba(255,255,255,0.12)';
        g.fillRect(0, y, S, 2);
      }
      grain(g, 10, seed, 8);
      for (let fy = 0; fy < 4; fy++) for (let bx = 0; bx < 4; bx++) window3(g, m, r, bx * C + 30, fy * C + 30, 68, 68, '#f4f4f4', { transom: false });
      return p;
    },
    shopfront(seed) {
      const p = setup(seed);
      const { g, m, r } = p;
      g.fillStyle = '#5b5e60';
      g.fillRect(0, 0, S, S);
      grain(g, 14, seed, 8);
      const signs = ['#c8312a', '#1f6fb2', '#2d8a4a', '#e2a12a', '#6b3fa0', '#d65a1c', '#d8d4cb'];
      for (let fy = 0; fy < 4; fy++) {
        for (let bx = 0; bx < 4; bx++) {
          const x = bx * C;
          const y = fy * C;
          g.fillStyle = signs[Math.floor(r() * signs.length)];
          g.fillRect(x + 4, y + 8, C - 8, 24);
          g.fillStyle = 'rgba(255,255,255,0.85)';
          for (let k = 0; k < 5; k++) g.fillRect(x + 18 + k * 18, y + 15, 10, 10);
          const grad = g.createLinearGradient(x, y + 36, x, y + 124);
          grad.addColorStop(0, '#9fb3c0');
          grad.addColorStop(1, '#3a4650');
          g.fillStyle = grad;
          g.fillRect(x + 8, y + 38, C - 16, 86);
          m.fillStyle = '#fff';
          m.fillRect(x + 8, y + 38, C - 16, 86);
          g.fillStyle = '#2c2f31';
          g.fillRect(x + 6, y + 36, C - 12, 4);
          g.fillRect(x + C / 2 - 2, y + 38, 4, 86);
        }
      }
      return p;
    },
    metalShed(seed) {
      const p = setup(seed);
      const { g, r } = p;
      const col = ['#a9b2b8', '#7f97ad', '#b9b6aa', '#8c9a8a'][Math.floor(r() * 4)];
      g.fillStyle = col;
      g.fillRect(0, 0, S, S);
      for (let x = 0; x < S; x += 16) {
        const grad = g.createLinearGradient(x, 0, x + 16, 0);
        grad.addColorStop(0, 'rgba(255,255,255,0.18)');
        grad.addColorStop(0.5, 'rgba(0,0,0,0.12)');
        grad.addColorStop(1, 'rgba(255,255,255,0.18)');
        g.fillStyle = grad;
        g.fillRect(x, 0, 16, S);
      }
      grain(g, 14, seed, 10);
      streaks(g, r, 0.12);
      return p;
    },
    factoryBrick(seed) {
      const p = setup(seed);
      const { g, m, r } = p;
      g.fillStyle = '#8a4a36';
      g.fillRect(0, 0, S, S);
      for (let y = 0; y < S; y += 8) {
        const off = (y / 8) % 2 ? 0 : 12;
        for (let x = -24; x < S; x += 24) {
          const v = r();
          g.fillStyle = `rgb(${120 + v * 35},${62 + v * 18},${46 + v * 12})`;
          g.fillRect(x + off + 1, y + 1, 22, 6);
        }
      }
      grain(g, 20, seed, 6);
      for (let fy = 0; fy < 2; fy++) {
        for (let bx = 0; bx < 4; bx++) {
          const x = bx * C + 20;
          const y = fy * 256 + 40;
          g.fillStyle = '#d9d6cf';
          g.fillRect(x - 4, y - 4, 96, 176);
          g.fillStyle = '#4c5961';
          g.fillRect(x, y, 88, 168);
          m.fillStyle = '#fff';
          m.fillRect(x, y, 88, 168);
          g.fillStyle = '#d9d6cf';
          for (let k = 1; k < 4; k++) g.fillRect(x + k * 22, y, 3, 168);
          for (let k = 1; k < 6; k++) g.fillRect(x, y + k * 28, 88, 3);
          for (let k = 0; k < 6; k++) if (r() < 0.25) {
            g.fillStyle = 'rgba(30,30,30,0.6)';
            g.fillRect(x + Math.floor(r() * 4) * 22 + 3, y + k * 28 + 3, 19, 25);
            g.fillStyle = '#d9d6cf';
          }
        }
      }
      return p;
    },
    concrete(seed) {
      const p = setup(seed);
      const { g, r } = p;
      g.fillStyle = '#a7a59e';
      g.fillRect(0, 0, S, S);
      grain(g, 40, seed, 6);
      g.fillStyle = 'rgba(60,60,60,0.35)';
      for (let i = 0; i <= 4; i++) g.fillRect(i * C - 1, 0, 2, S);
      streaks(g, r, 0.12);
      return p;
    },
    roofTin(seed) {
      return roofSeams(seed, '#4f7357');
    },
    roofTinRed(seed) {
      return roofSeams(seed, '#8a3b2e');
    },
    roofFlat(seed) {
      const p = setup(seed);
      const { g } = p;
      g.fillStyle = '#4a4a48';
      g.fillRect(0, 0, S, S);
      grain(g, 40, seed, 12);
      g.fillStyle = 'rgba(0,0,0,0.25)';
      for (let i = 0; i < 6; i++) g.fillRect(0, i * 90, S, 3);
      return p;
    },
    roofSlate(seed) {
      const p = setup(seed);
      const { g } = p;
      for (let x = 0; x < S; x += 32) {
        const grad = g.createLinearGradient(x, 0, x + 32, 0);
        grad.addColorStop(0, '#8e8f88');
        grad.addColorStop(0.5, '#b2b3ab');
        grad.addColorStop(1, '#7e7f79');
        g.fillStyle = grad;
        g.fillRect(x, 0, 32, S);
      }
      for (let y = 0; y < S; y += 128) {
        g.fillStyle = 'rgba(0,0,0,0.25)';
        g.fillRect(0, y, S, 4);
      }
      grain(g, 34, seed, 10, [0, 4, -2]);
      return p;
    },
    garageDoors(seed) {
      const p = setup(seed);
      const { g, r } = p;
      g.fillStyle = '#a6a49b';
      g.fillRect(0, 0, S, S);
      grain(g, 30, seed, 6);
      const doors = ['#5b6b78', '#7b4d36', '#3e5a45', '#8a8f93', '#6a3434', '#b5a77a'];
      for (let fy = 0; fy < 4; fy++) {
        for (let bx = 0; bx < 4; bx++) {
          const x = bx * C + 12;
          const y = fy * C + 24;
          g.fillStyle = doors[Math.floor(r() * doors.length)];
          g.fillRect(x, y, C - 24, C - 24);
          g.fillStyle = 'rgba(0,0,0,0.3)';
          g.fillRect(x + (C - 24) / 2 - 1, y, 3, C - 24);
          for (let k = 0; k < 6; k++) g.fillRect(x, y + k * 17, C - 24, 1);
          streaks(g, r, 0.04);
        }
      }
      return p;
    },
    warehouseDock(seed) {
      const p = setup(seed);
      const { g } = p;
      g.fillStyle = '#b5bcc1';
      g.fillRect(0, 0, S, S);
      for (let x = 0; x < S; x += 12) {
        g.fillStyle = 'rgba(0,0,0,0.08)';
        g.fillRect(x, 0, 4, S);
      }
      grain(g, 18, seed, 8);
      for (let bx = 0; bx < 4; bx++) {
        for (let fy = 0; fy < 2; fy++) {
          const x = bx * C + 14;
          const y = fy * 256 + 70;
          g.fillStyle = '#2c3135';
          g.fillRect(x - 6, y - 6, C - 16, 186);
          g.fillStyle = '#d7dadb';
          g.fillRect(x, y, C - 28, 160);
          g.fillStyle = 'rgba(0,0,0,0.18)';
          for (let k = 0; k < 10; k++) g.fillRect(x, y + k * 16, C - 28, 2);
          g.fillStyle = '#e0b21b';
          g.fillRect(x - 6, y + 168, C - 16, 12);
        }
      }
      return p;
    },
    kremlinBrick(seed) {
      const p = setup(seed);
      const { g, r } = p;
      g.fillStyle = '#8f3326';
      g.fillRect(0, 0, S, S);
      for (let y = 0; y < S; y += 10) {
        const off = (y / 10) % 2 ? 0 : 14;
        for (let x = -28; x < S; x += 28) {
          const v = r();
          g.fillStyle = `rgb(${150 + v * 35},${52 + v * 18},${40 + v * 12})`;
          g.fillRect(x + off + 1, y + 1, 26, 8);
        }
      }
      grain(g, 22, seed, 6);
      return p;
    },
    whiteStone(seed) {
      const p = setup(seed);
      const { g, r } = p;
      g.fillStyle = '#e6e1d4';
      g.fillRect(0, 0, S, S);
      for (let y = 0; y < S; y += 32) {
        const off = (y / 32) % 2 ? 0 : 32;
        for (let x = -64; x < S; x += 64) {
          const v = 220 + r() * 25;
          g.fillStyle = `rgb(${v},${v - 4},${v - 14})`;
          g.fillRect(x + off + 2, y + 2, 60, 28);
        }
      }
      grain(g, 26, seed, 6);
      streaks(g, r, 0.06);
      return p;
    },
    school(seed) {
      const p = setup(seed);
      const { g, m, r } = p;
      g.fillStyle = '#d8cfb8';
      g.fillRect(0, 0, S, S);
      grain(g, 18, seed, 7);
      for (let fy = 0; fy < 4; fy++) {
        g.fillStyle = 'rgba(140,90,70,0.35)';
        g.fillRect(0, fy * C + 112, S, 16);
        for (let bx = 0; bx < 4; bx++) window3(g, m, r, bx * C + 14, fy * C + 20, 100, 82, '#f2f0ea', { split: 0.33 });
      }
      return p;
    },
    balconyStack(seed) {
      // glazed loggias with mismatched frames, a hallmark of Soviet housing
      const p = setup(seed);
      const { g, m, r } = p;
      g.fillStyle = '#cfcdc6';
      g.fillRect(0, 0, S, S);
      grain(g, 20, seed, 8);
      for (let fy = 0; fy < 4; fy++) {
        for (let bx = 0; bx < 4; bx++) {
          const x = bx * C + 4;
          const y = fy * C;
          const glazed = r() < 0.65;
          g.fillStyle = ['#d8d6cf', '#b9b4a6', '#c7c9cc', '#a8b2a0'][Math.floor(r() * 4)];
          g.fillRect(x, y + 70, C - 8, 54);
          g.fillStyle = 'rgba(0,0,0,0.25)';
          g.fillRect(x, y + 122, C - 8, 6);
          if (glazed) {
            const grad = g.createLinearGradient(x, y + 10, x, y + 70);
            grad.addColorStop(0, '#7d93a3');
            grad.addColorStop(1, '#384651');
            g.fillStyle = grad;
            g.fillRect(x + 2, y + 10, C - 12, 60);
            m.fillStyle = '#fff';
            m.fillRect(x + 2, y + 10, C - 12, 60);
            g.strokeStyle = r() < 0.5 ? '#f2f2ee' : '#6b4b33';
            g.lineWidth = 3;
            for (let k = 0; k <= 4; k++) {
              g.beginPath();
              g.moveTo(x + 2 + (k * (C - 12)) / 4, y + 10);
              g.lineTo(x + 2 + (k * (C - 12)) / 4, y + 70);
              g.stroke();
            }
          } else {
            g.fillStyle = '#3a3f44';
            g.fillRect(x + 2, y + 10, C - 12, 60);
            g.fillStyle = CURTAINS[Math.floor(r() * CURTAINS.length)];
            g.fillRect(x + 20, y + 20, 26, 50);
          }
        }
      }
      return p;
    },
    gold(seed) {
      const p = setup(seed);
      const { g } = p;
      const grad = g.createLinearGradient(0, 0, S, S);
      grad.addColorStop(0, '#e5c15a');
      grad.addColorStop(0.5, '#b88a2b');
      grad.addColorStop(1, '#f0d27a');
      g.fillStyle = grad;
      g.fillRect(0, 0, S, S);
      grain(g, 20, seed, 10);
      return p;
    },
    stadium(seed) {
      const p = setup(seed);
      const { g } = p;
      g.fillStyle = '#e9ecee';
      g.fillRect(0, 0, S, S);
      g.strokeStyle = 'rgba(80,90,100,0.35)';
      g.lineWidth = 4;
      for (let k = -S; k < S * 2; k += 64) {
        g.beginPath();
        g.moveTo(k, 0);
        g.lineTo(k + S, S);
        g.moveTo(k, S);
        g.lineTo(k + S, 0);
        g.stroke();
      }
      grain(g, 12, seed, 8);
      return p;
    },
    plasterWhite(seed) {
      const p = setup(seed);
      const { g, m, r } = p;
      g.fillStyle = '#ece8df';
      g.fillRect(0, 0, S, S);
      grain(g, 18, seed, 6);
      for (let fy = 0; fy < 4; fy++) {
        g.fillStyle = 'rgba(0,0,0,0.08)';
        g.fillRect(0, fy * C + 120, S, 6);
        for (let bx = 0; bx < 4; bx++) window3(g, m, r, bx * C + 34, fy * C + 24, 60, 84, '#ffffff', { reveal: 'rgba(0,0,0,0.12)' });
      }
      return p;
    },
    tvTower(seed) {
      const p = setup(seed);
      const { g } = p;
      for (let y = 0; y < S; y += 128) {
        g.fillStyle = (y / 128) % 2 ? '#d23a2c' : '#f1f0ec';
        g.fillRect(0, y, S, 128);
      }
      grain(g, 14, seed, 8);
      return p;
    },
    woodFence(seed) {
      const p = setup(seed);
      const { g, r } = p;
      for (let x = 0; x < S; x += 32) {
        const v = 0.7 + r() * 0.3;
        g.fillStyle = `rgb(${Math.round(128 * v)},${Math.round(98 * v)},${Math.round(66 * v)})`;
        g.fillRect(x, 0, 30, S);
        g.fillStyle = 'rgba(0,0,0,0.35)';
        g.fillRect(x + 30, 0, 2, S);
      }
      grain(g, 34, seed, 16, [-10, -12, -14]);
      return p;
    },
    profFence(seed) {
      const p = setup(seed);
      const { g, r } = p;
      const col = ['#3e6b53', '#7c3a2e', '#3c5a7e', '#8b8f90'][Math.floor(r() * 4)];
      g.fillStyle = col;
      g.fillRect(0, 0, S, S);
      for (let x = 0; x < S; x += 22) {
        g.fillStyle = 'rgba(255,255,255,0.16)';
        g.fillRect(x, 0, 6, S);
        g.fillStyle = 'rgba(0,0,0,0.2)';
        g.fillRect(x + 6, 0, 3, S);
      }
      grain(g, 12, seed, 10);
      return p;
    },
    door(seed) {
      const p = setup(seed);
      const { g } = p;
      g.fillStyle = '#5a4030';
      g.fillRect(0, 0, S, S);
      g.fillStyle = '#3d2b20';
      for (let i = 0; i < 4; i++) g.fillRect(i * C + 20, 20, C - 40, S - 40);
      grain(g, 20, seed, 8);
      return p;
    },
    signRed(seed) {
      const p = setup(seed);
      const { g } = p;
      g.fillStyle = '#c42a24';
      g.fillRect(0, 0, S, S);
      g.fillStyle = '#ffffff';
      for (let i = 0; i < 4; i++) g.fillRect(i * C + 16, 40, C - 32, 48);
      return p;
    },
  };
}

function stalinka(seed, wall, trim) {
  const p = setup(seed);
  const { g, m, r } = p;
  g.fillStyle = wall;
  g.fillRect(0, 0, S, S);
  grain(g, 22, seed, 6);
  // pilasters between bays and string courses
  for (let bx = 0; bx <= 4; bx++) {
    g.fillStyle = trim;
    g.fillRect(bx * C - 7, 0, 14, S);
    g.fillStyle = 'rgba(0,0,0,0.12)';
    g.fillRect(bx * C + 7, 0, 3, S);
  }
  for (let fy = 0; fy < 4; fy++) {
    g.fillStyle = trim;
    g.fillRect(0, fy * C + 118, S, 10);
    for (let bx = 0; bx < 4; bx++) {
      const x = bx * C + 34;
      const y = fy * C + 16;
      g.fillStyle = trim;
      g.fillRect(x - 8, y - 8, 76, 100);
      g.fillStyle = 'rgba(0,0,0,0.15)';
      g.fillRect(x - 8, y - 12, 76, 4);
      window3(g, m, r, x, y, 60, 88, '#f6f3ec', { reveal: 'rgba(0,0,0,0.18)' });
    }
  }
  streaks(g, r, 0.05);
  return p;
}

function glass(seed, [top, bottom], frame) {
  const p = setup(seed);
  const { g, m, r } = p;
  for (let fy = 0; fy < 4; fy++) {
    for (let bx = 0; bx < 4; bx++) {
      const x = bx * C;
      const y = fy * C;
      const grad = g.createLinearGradient(x, y, x + C * 0.6, y + C);
      const k = 0.85 + r() * 0.3;
      grad.addColorStop(0, top);
      grad.addColorStop(1, bottom);
      g.fillStyle = grad;
      g.globalAlpha = k;
      g.fillRect(x, y, C, C);
      g.globalAlpha = 1;
    }
  }
  m.fillStyle = '#fff';
  m.fillRect(0, 0, S, S);
  g.fillStyle = frame;
  m.fillStyle = '#000';
  for (let i = 0; i <= 8; i++) {
    g.fillRect(i * 64 - 2, 0, 4, S);
    m.fillRect(i * 64 - 2, 0, 4, S);
  }
  for (let i = 0; i <= 4; i++) {
    g.fillRect(0, i * C - 5, S, 10);
    m.fillRect(0, i * C - 5, S, 10);
  }
  return p;
}

function roofSeams(seed, color) {
  const p = setup(seed);
  const { g } = p;
  g.fillStyle = color;
  g.fillRect(0, 0, S, S);
  for (let x = 0; x < S; x += 32) {
    g.fillStyle = 'rgba(255,255,255,0.18)';
    g.fillRect(x, 0, 3, S);
    g.fillStyle = 'rgba(0,0,0,0.25)';
    g.fillRect(x + 3, 0, 2, S);
  }
  grain(g, 22, seed, 10);
  return p;
}

export function paintFacades() {
  const P = painters();
  return FACADES.map((name, i) => P[name](1000 + i * 17));
}
