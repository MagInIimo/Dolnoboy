// Keyboard (layout independent), mouse orbit, touch pedals/wheel/joystick and gamepad.
const CYR = { 'ц': 'KeyW', 'ф': 'KeyA', 'ы': 'KeyS', 'в': 'KeyD', 'й': 'KeyQ', 'у': 'KeyE', 'д': 'KeyL', 'л': 'KeyK', 'р': 'KeyH', 'с': 'KeyC', 'к': 'KeyR', 'е': 'KeyT', 'м': 'KeyV', 'ь': 'KeyM', 'о': 'KeyJ', 'з': 'KeyP', 'ч': 'KeyX', 'г': 'KeyU', 'ш': 'KeyI', 'п': 'KeyG' };
const LAT = { w: 'KeyW', a: 'KeyA', s: 'KeyS', d: 'KeyD', q: 'KeyQ', e: 'KeyE', l: 'KeyL', k: 'KeyK', h: 'KeyH', c: 'KeyC', r: 'KeyR', t: 'KeyT', v: 'KeyV', m: 'KeyM', j: 'KeyJ', p: 'KeyP', x: 'KeyX', u: 'KeyU', i: 'KeyI', g: 'KeyG' };

const ACTIONS = {
  KeyQ: 'indicatorLeft', KeyE: 'indicatorRight', KeyX: 'hazard', KeyL: 'lights', KeyK: 'highBeam', KeyH: 'horn', KeyC: 'cruise', KeyR: 'retarder',
  KeyT: 'trailer', Enter: 'interact', NumpadEnter: 'interact', KeyF: 'interact', KeyV: 'camera', Digit1: 'cam1', Digit2: 'cam2', Digit3: 'cam3', KeyM: 'map', KeyJ: 'jobs', KeyP: 'pause', Escape: 'pause', KeyG: 'garage', Space: 'handbrake',
};

export class Input {
  constructor(frame, onAction) {
    this.frame = frame;
    this.onAction = onAction;
    this.keys = new Set();
    this.enabled = true;
    this.touch = { gas: 0, brake: 0, steer: 0, active: false };
    this.steerSmooth = 0;
    this.drag = null;
    this.onDrag = null;
    this.onZoom = null;
    this.handbrakeHeld = false;
    addEventListener('keydown', (e) => this.key(e, true));
    addEventListener('keyup', (e) => this.key(e, false));
    addEventListener('blur', () => this.reset());
  }

  code(e) {
    if (e.code && e.code !== 'Unidentified') return e.code;
    const k = (e.key || '').toLowerCase();
    return CYR[k] ?? LAT[k] ?? e.key;
  }

  key(e, down) {
    const target = e.target;
    if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;
    let code = this.code(e);
    // Russian layout reports physical codes normally; fall back to the character just in case
    if (!ACTIONS[code] && !/^(Key|Arrow|Digit)/.test(code)) code = CYR[(e.key || '').toLowerCase()] ?? code;
    const gameKey = /^(KeyW|KeyA|KeyS|KeyD|Arrow(Up|Down|Left|Right)|Space)$/.test(code) || ACTIONS[code];
    if (gameKey && !e.ctrlKey && !e.metaKey && !e.altKey) e.preventDefault();
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (down) {
      if (this.keys.has(code)) return;
      this.keys.add(code);
      const action = ACTIONS[code];
      if (action) this.onAction(action);
    } else this.keys.delete(code);
  }

  reset() {
    this.keys.clear();
    this.touch.gas = this.touch.brake = this.touch.steer = 0;
  }

  // Returns {throttle, brake, steer (+1 right), handbrake}
  read(dt) {
    if (!this.enabled) return { throttle: 0, brake: 0, steer: 0, handbrake: false };
    const k = this.keys;
    let throttle = k.has('KeyW') || k.has('ArrowUp') ? 1 : 0;
    let brake = k.has('KeyS') || k.has('ArrowDown') ? 1 : 0;
    const left = k.has('KeyA') || k.has('ArrowLeft');
    const right = k.has('KeyD') || k.has('ArrowRight');
    let steerKey = (right ? 1 : 0) - (left ? 1 : 0);
    // keyboard steering eases in so the rig does not twitch
    const target = steerKey;
    const rate = target === 0 ? 3.2 : 1.9;
    this.steerSmooth += Math.max(-rate * dt, Math.min(rate * dt, target - this.steerSmooth));
    let steer = this.steerSmooth;
    if (this.touch.active) {
      throttle = Math.max(throttle, this.touch.gas);
      brake = Math.max(brake, this.touch.brake);
      if (Math.abs(this.touch.steer) > 0.01) steer = this.touch.steer;
    }
    const pad = this.gamepad();
    if (pad) {
      throttle = Math.max(throttle, pad.throttle);
      brake = Math.max(brake, pad.brake);
      if (Math.abs(pad.steer) > 0.08) steer = pad.steer;
    }
    return { throttle, brake, steer, handbrake: false, steerRate: this.touch.active || pad ? 2.6 : 1.7 };
  }

  gamepad() {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (const p of pads) {
      if (!p || !p.connected) continue;
      const ax = p.axes[0] ?? 0;
      const rt = p.buttons[7]?.value ?? 0;
      const lt = p.buttons[6]?.value ?? 0;
      const pressed = (i) => p.buttons[i]?.pressed;
      this.padPrev = this.padPrev ?? [];
      const edge = (i, action) => {
        if (pressed(i) && !this.padPrev[i]) this.onAction(action);
        this.padPrev[i] = pressed(i);
      };
      edge(0, 'interact');
      edge(1, 'camera');
      edge(2, 'horn');
      edge(3, 'lights');
      edge(4, 'indicatorLeft');
      edge(5, 'indicatorRight');
      edge(9, 'pause');
      edge(8, 'map');
      return { steer: Math.abs(ax) < 0.06 ? 0 : ax, throttle: rt, brake: lt };
    }
    return null;
  }

  // Pointer drag on the 3D view orbits the camera; wheel zooms.
  bindView(el) {
    el.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 && e.pointerType === 'mouse') return;
      this.drag = { id: e.pointerId, x: e.clientX, y: e.clientY };
      el.setPointerCapture?.(e.pointerId);
    });
    el.addEventListener('pointermove', (e) => {
      if (!this.drag || this.drag.id !== e.pointerId) return;
      const dx = e.clientX - this.drag.x;
      const dy = e.clientY - this.drag.y;
      this.drag.x = e.clientX;
      this.drag.y = e.clientY;
      this.onDrag?.(dx, dy);
    });
    const end = (e) => {
      if (this.drag && this.drag.id === e.pointerId) this.drag = null;
    };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
    el.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.onZoom?.(e.deltaY);
    }, { passive: false });
  }
}
