import * as THREE from 'three';
import { rng } from '../core/util.js';

export function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('image ' + url));
    img.src = url;
  });
}

export function canvas(size, h = size) {
  const c = document.createElement('canvas');
  c.width = size;
  c.height = h;
  return c;
}

export function imageToCanvas(img, size, filter = null) {
  const c = canvas(size);
  const g = c.getContext('2d', { willReadFrequently: true });
  if (filter) g.filter = filter;
  g.drawImage(img, 0, 0, size, size);
  return c;
}

// Packs equally sized canvases into a mip-mapped texture array.
export function arrayTexture(canvases, { srgb = true, anisotropy = 4 } = {}) {
  const size = canvases[0].width;
  const data = new Uint8Array(size * size * 4 * canvases.length);
  canvases.forEach((c, i) => {
    const pixels = c.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, size, size).data;
    data.set(pixels, i * size * size * 4);
  });
  const tex = new THREE.DataArrayTexture(data, size, size, canvases.length);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.anisotropy = anisotropy;
  tex.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  tex.needsUpdate = true;
  return tex;
}

// Seamless value noise in [0,1] on a periodic lattice.
export function tileNoise(size, period, seed, octaves = 4) {
  const r = rng(seed);
  const out = new Float32Array(size * size);
  let amp = 1;
  let norm = 0;
  let p = period;
  for (let o = 0; o < octaves; o++) {
    const grid = new Float32Array(p * p).map(() => r());
    for (let y = 0; y < size; y++) {
      const gy = (y / size) * p;
      const y0 = Math.floor(gy);
      const ty = gy - y0;
      const sy = ty * ty * (3 - 2 * ty);
      for (let x = 0; x < size; x++) {
        const gx = (x / size) * p;
        const x0 = Math.floor(gx);
        const tx = gx - x0;
        const sx = tx * tx * (3 - 2 * tx);
        const a = grid[(y0 % p) * p + (x0 % p)];
        const b = grid[(y0 % p) * p + ((x0 + 1) % p)];
        const c = grid[((y0 + 1) % p) * p + (x0 % p)];
        const d = grid[((y0 + 1) % p) * p + ((x0 + 1) % p)];
        out[y * size + x] += amp * (a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy);
      }
    }
    norm += amp;
    amp *= 0.5;
    p *= 2;
  }
  for (let i = 0; i < out.length; i++) out[i] /= norm;
  return out;
}

export function noiseCanvas(size, period, seed, octaves, paint) {
  const c = canvas(size);
  const g = c.getContext('2d', { willReadFrequently: true });
  const img = g.createImageData(size, size);
  const n = tileNoise(size, period, seed, octaves);
  for (let i = 0; i < size * size; i++) {
    const [r, gg, b, a = 255] = paint(n[i], i % size, Math.floor(i / size));
    img.data[i * 4] = r;
    img.data[i * 4 + 1] = gg;
    img.data[i * 4 + 2] = b;
    img.data[i * 4 + 3] = a;
  }
  g.putImageData(img, 0, 0);
  return c;
}

export function tintCanvas(src, fn) {
  const size = src.width;
  const c = canvas(size);
  const g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(src, 0, 0);
  const img = g.getImageData(0, 0, size, size);
  for (let i = 0; i < img.data.length; i += 4) {
    const [r, gg, b] = fn(img.data[i], img.data[i + 1], img.data[i + 2], (i / 4) % size, Math.floor(i / 4 / size));
    img.data[i] = r;
    img.data[i + 1] = gg;
    img.data[i + 2] = b;
  }
  g.putImageData(img, 0, 0);
  return c;
}

export function flatNormalCanvas(size) {
  const c = canvas(size);
  const g = c.getContext('2d');
  g.fillStyle = 'rgb(128,128,255)';
  g.fillRect(0, 0, size, size);
  return c;
}
