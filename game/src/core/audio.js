// Synthesised truck audio with Web Audio API only (no media elements).
export class Sound {
  constructor() {
    this.ctx = null;
    this.enabled = true;
    this.volume = 0.8;
    this.active = false;
    this.interior = false;
    this.lastBlink = false;
  }

  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended' && this.active) this.ctx.resume().catch(() => {});
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    this.ctx = ctx;
    const master = ctx.createGain();
    master.gain.value = 0;
    master.connect(ctx.destination);
    this.master = master;
    // shared noise buffer
    const len = ctx.sampleRate * 2;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    this.noiseBuf = buf;
    // engine: harmonic pulse with load-dependent filter
    const engineFilter = ctx.createBiquadFilter();
    engineFilter.type = 'lowpass';
    engineFilter.frequency.value = 600;
    engineFilter.Q.value = 0.8;
    const engineGain = ctx.createGain();
    engineGain.gain.value = 0;
    engineFilter.connect(engineGain).connect(master);
    const real = new Float32Array(24);
    const imag = new Float32Array(24);
    for (let k = 1; k < 24; k++) imag[k] = (k % 3 === 0 ? 1.4 : 1) / Math.pow(k, 1.05) * (k === 1 ? 1.2 : 1);
    const wave = ctx.createPeriodicWave(real, imag);
    const osc = ctx.createOscillator();
    osc.setPeriodicWave(wave);
    osc.frequency.value = 30;
    osc.connect(engineFilter);
    osc.start();
    const sub = ctx.createOscillator();
    sub.type = 'sine';
    sub.frequency.value = 15;
    const subGain = ctx.createGain();
    subGain.gain.value = 0.35;
    sub.connect(subGain).connect(engineFilter);
    sub.start();
    // combustion roughness: noise amplitude-modulated at the firing frequency
    const rough = this.noise();
    const roughFilter = ctx.createBiquadFilter();
    roughFilter.type = 'bandpass';
    roughFilter.frequency.value = 900;
    roughFilter.Q.value = 0.7;
    const roughGain = ctx.createGain();
    roughGain.gain.value = 0;
    const amp = ctx.createGain();
    amp.gain.value = 0.5;
    const lfo = ctx.createOscillator();
    lfo.type = 'square';
    lfo.frequency.value = 30;
    const lfoDepth = ctx.createGain();
    lfoDepth.gain.value = 0.5;
    lfo.connect(lfoDepth).connect(amp.gain);
    lfo.start();
    rough.connect(roughFilter).connect(amp).connect(roughGain).connect(master);
    // turbo whistle
    const turbo = ctx.createOscillator();
    turbo.type = 'sine';
    turbo.frequency.value = 2400;
    const turboGain = ctx.createGain();
    turboGain.gain.value = 0;
    turbo.connect(turboGain).connect(master);
    turbo.start();
    // wind and tyres
    const wind = this.noise();
    const windFilter = ctx.createBiquadFilter();
    windFilter.type = 'lowpass';
    windFilter.frequency.value = 500;
    const windGain = ctx.createGain();
    windGain.gain.value = 0;
    wind.connect(windFilter).connect(windGain).connect(master);
    const tyre = this.noise();
    const tyreFilter = ctx.createBiquadFilter();
    tyreFilter.type = 'bandpass';
    tyreFilter.frequency.value = 300;
    tyreFilter.Q.value = 0.6;
    const tyreGain = ctx.createGain();
    tyreGain.gain.value = 0;
    tyre.connect(tyreFilter).connect(tyreGain).connect(master);
    const rain = this.noise();
    const rainFilter = ctx.createBiquadFilter();
    rainFilter.type = 'highpass';
    rainFilter.frequency.value = 1400;
    const rainGain = ctx.createGain();
    rainGain.gain.value = 0;
    rain.connect(rainFilter).connect(rainGain).connect(master);
    this.nodes = { osc, sub, engineFilter, engineGain, roughGain, roughFilter, lfo, turbo, turboGain, windGain, windFilter, tyreGain, tyreFilter, rainGain };
    this.birdTimer = 3;
  }

  noise() {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    src.start(0, Math.random() * 1.5);
    return src;
  }

  setActive(on) {
    this.active = on && this.enabled;
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(t);
    this.master.gain.setTargetAtTime(this.active ? this.volume : 0, t, 0.08);
    if (this.active && this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
    if (!this.active) {
      clearTimeout(this.suspendTimer);
      this.suspendTimer = setTimeout(() => {
        if (!this.active && this.ctx.state === 'running') this.ctx.suspend().catch(() => {});
      }, 400);
    }
  }

  update(dt, s) {
    if (!this.ctx || !this.active) return;
    const n = this.nodes;
    const t = this.ctx.currentTime;
    const rpm = s.engineOn ? s.rpm : 0;
    const fire = (rpm / 60) * 3;
    const load = s.throttle;
    const inside = s.interior;
    n.osc.frequency.setTargetAtTime(Math.max(8, fire), t, 0.03);
    n.sub.frequency.setTargetAtTime(Math.max(4, fire / 2), t, 0.03);
    n.lfo.frequency.setTargetAtTime(Math.max(6, fire), t, 0.03);
    n.engineFilter.frequency.setTargetAtTime((inside ? 260 : 380) + load * (inside ? 700 : 1500) + rpm * 0.25, t, 0.05);
    n.engineGain.gain.setTargetAtTime(s.engineOn ? (0.16 + load * 0.2 + rpm / 9000) * (inside ? 1.15 : 0.9) : 0, t, 0.06);
    n.roughGain.gain.setTargetAtTime(s.engineOn ? (0.03 + load * 0.06) * (inside ? 0.5 : 1) : 0, t, 0.06);
    n.roughFilter.frequency.setTargetAtTime(700 + rpm * 0.6, t, 0.05);
    const boost = Math.max(0, load - 0.2) * Math.min(1, rpm / 1400);
    n.turbo.frequency.setTargetAtTime(1800 + rpm * 1.6, t, 0.1);
    n.turboGain.gain.setTargetAtTime(boost * 0.012 * (inside ? 0.6 : 1), t, 0.2);
    const v = Math.abs(s.speed);
    n.windGain.gain.setTargetAtTime(Math.min(0.28, (v * v) / 3200) * (inside ? 0.5 : 1), t, 0.1);
    n.windFilter.frequency.setTargetAtTime(300 + v * 25, t, 0.1);
    const off = s.surface === 'grass' ? 1 : 0;
    n.tyreGain.gain.setTargetAtTime(Math.min(0.2, v / 140) * (off ? 2.2 : 1) + s.slip * 0.15, t, 0.1);
    n.tyreFilter.frequency.setTargetAtTime(off ? 180 : 260 + v * 6, t, 0.1);
    n.rainGain.gain.setTargetAtTime(s.rain * (inside ? 0.12 : 0.07), t, 0.3);
    // turn signal relay
    if (s.blinkOn !== this.lastBlink) {
      this.lastBlink = s.blinkOn;
      if (s.indicating) this.click(s.blinkOn ? 2600 : 1900, 0.05);
    }
    if (s.daylight && s.countryside && v < 25) {
      this.birdTimer -= dt;
      if (this.birdTimer <= 0) {
        this.birdTimer = 2 + Math.random() * 6;
        this.bird();
      }
    }
  }

  click(freq, gain) {
    if (!this.ctx || !this.active) return;
    const ctx = this.ctx;
    const src = this.noise();
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = freq;
    f.Q.value = 4;
    const g = ctx.createGain();
    const t = ctx.currentTime;
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.03);
    src.connect(f).connect(g).connect(this.master);
    src.stop(t + 0.05);
  }

  hiss(duration = 0.7, gain = 0.25) {
    if (!this.ctx || !this.active) return;
    const ctx = this.ctx;
    const src = this.noise();
    const f = ctx.createBiquadFilter();
    f.type = 'highpass';
    f.frequency.value = 2200;
    const g = ctx.createGain();
    const t = ctx.currentTime;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.03);
    g.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    src.connect(f).connect(g).connect(this.master);
    src.stop(t + duration + 0.05);
  }

  thud(strength = 1) {
    if (!this.ctx || !this.active) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(90, t);
    o.frequency.exponentialRampToValueAtTime(35, t + 0.35);
    const g = ctx.createGain();
    g.gain.setValueAtTime(Math.min(1, 0.4 * strength), t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.45);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + 0.5);
    this.click(400, Math.min(0.5, 0.25 * strength));
  }

  horn(on) {
    if (!this.ctx || !this.active) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    if (on && !this.hornNodes) {
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.22, t + 0.05);
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = 2400;
      f.connect(g).connect(this.master);
      const oscs = [233, 277, 349].map((fr) => {
        const o = ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = fr;
        o.connect(f);
        o.start();
        return o;
      });
      this.hornNodes = { g, oscs };
    } else if (!on && this.hornNodes) {
      const { g, oscs } = this.hornNodes;
      g.gain.setTargetAtTime(0.0001, t, 0.04);
      for (const o of oscs) o.stop(t + 0.3);
      this.hornNodes = null;
    }
  }

  chime(kind = 'good') {
    if (!this.ctx || !this.active) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const notes = kind === 'good' ? [523, 659, 784] : kind === 'bad' ? [392, 330] : [660];
    notes.forEach((fr, i) => {
      const o = ctx.createOscillator();
      o.type = 'triangle';
      o.frequency.value = fr;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t + i * 0.11);
      g.gain.exponentialRampToValueAtTime(0.18, t + i * 0.11 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.11 + 0.4);
      o.connect(g).connect(this.master);
      o.start(t + i * 0.11);
      o.stop(t + i * 0.11 + 0.45);
    });
  }

  bird() {
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const base = 2600 + Math.random() * 1800;
    const n = 2 + Math.floor(Math.random() * 4);
    for (let i = 0; i < n; i++) {
      const o = ctx.createOscillator();
      o.type = 'sine';
      const st = t + i * 0.12;
      o.frequency.setValueAtTime(base, st);
      o.frequency.exponentialRampToValueAtTime(base * (1.2 + Math.random() * 0.3), st + 0.07);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, st);
      g.gain.exponentialRampToValueAtTime(0.018, st + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, st + 0.09);
      o.connect(g).connect(this.master);
      o.start(st);
      o.stop(st + 0.1);
    }
  }
}
