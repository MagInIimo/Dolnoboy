// On-screen steering wheel + pedals, or a one-handed joystick.
export class TouchControls {
  constructor(frame, input, game) {
    this.input = input;
    this.game = game;
    const root = document.createElement('div');
    root.id = 'touch';
    root.innerHTML = `
      <div class="wheel zone"></div>
      <div class="tsmall left"><button data-t="reverse">R</button><button data-t="horn">◉</button></div>
      <div class="tsmall right"><button data-t="lights">☀</button><button data-t="trailer">T</button></div>
      <div class="pedals"><div class="pedal brake zone" data-p="brake"></div><div class="pedal gas zone" data-p="gas"></div></div>
      <div class="joystick zone" hidden><i></i></div>`;
    frame.appendChild(root);
    this.root = root;
    this.wheel = root.querySelector('.wheel');
    this.joy = root.querySelector('.joystick');
    this.knob = this.joy.querySelector('i');
    this.wheelAngle = 0;
    this.wheelPointer = null;
    this.applyLabels();
    const prevent = (e) => e.preventDefault();
    root.addEventListener('contextmenu', prevent);
    // pedals
    for (const pedal of root.querySelectorAll('.pedal')) {
      const key = pedal.dataset.p;
      const press = (on) => (e) => {
        e.preventDefault();
        input.touch.active = true;
        input.touch[key] = on ? 1 : 0;
        pedal.classList.toggle('on', on);
        if (on) pedal.setPointerCapture?.(e.pointerId);
        game.sound.unlock();
      };
      pedal.addEventListener('pointerdown', press(true));
      pedal.addEventListener('pointerup', press(false));
      pedal.addEventListener('pointercancel', press(false));
      pedal.addEventListener('lostpointercapture', () => {
        input.touch[key] = 0;
        pedal.classList.remove('on');
      });
    }
    // steering wheel: angle of the finger around the wheel centre
    const wheelDown = (e) => {
      e.preventDefault();
      this.wheel.setPointerCapture?.(e.pointerId);
      this.wheelPointer = { id: e.pointerId, start: this.fingerAngle(e), base: this.wheelAngle };
      input.touch.active = true;
      game.sound.unlock();
    };
    const wheelMove = (e) => {
      if (!this.wheelPointer || this.wheelPointer.id !== e.pointerId) return;
      let d = this.fingerAngle(e) - this.wheelPointer.start;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      this.wheelAngle = Math.max(-2.2, Math.min(2.2, this.wheelPointer.base + d));
      this.wheelPointer.start = this.fingerAngle(e);
      this.wheelPointer.base = this.wheelAngle;
      this.applyWheel();
    };
    const wheelUp = (e) => {
      if (this.wheelPointer && this.wheelPointer.id === e.pointerId) this.wheelPointer = null;
    };
    this.wheel.addEventListener('pointerdown', wheelDown);
    this.wheel.addEventListener('pointermove', wheelMove);
    this.wheel.addEventListener('pointerup', wheelUp);
    this.wheel.addEventListener('pointercancel', wheelUp);
    // joystick
    const joyMove = (e) => {
      const r = this.joy.getBoundingClientRect();
      const x = (e.clientX - (r.left + r.width / 2)) / (r.width / 2);
      const y = (e.clientY - (r.top + r.height / 2)) / (r.height / 2);
      const l = Math.hypot(x, y);
      const k = l > 1 ? 1 / l : 1;
      const jx = x * k;
      const jy = y * k;
      this.knob.style.transform = `translate(${jx * 60}px, ${jy * 60}px)`;
      input.touch.steer = Math.abs(jx) < 0.08 ? 0 : jx;
      input.touch.gas = jy < -0.12 ? Math.min(1, -jy * 1.2) : 0;
      input.touch.brake = jy > 0.12 ? Math.min(1, jy * 1.2) : 0;
    };
    let joyId = null;
    this.joy.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      joyId = e.pointerId;
      this.joy.setPointerCapture?.(e.pointerId);
      input.touch.active = true;
      game.sound.unlock();
      joyMove(e);
    });
    this.joy.addEventListener('pointermove', (e) => {
      if (e.pointerId === joyId) joyMove(e);
    });
    const joyEnd = (e) => {
      if (e.pointerId !== joyId) return;
      joyId = null;
      this.knob.style.transform = '';
      input.touch.steer = input.touch.gas = input.touch.brake = 0;
    };
    this.joy.addEventListener('pointerup', joyEnd);
    this.joy.addEventListener('pointercancel', joyEnd);
    // small buttons
    for (const b of root.querySelectorAll('[data-t]')) {
      const act = b.dataset.t;
      if (act === 'horn') {
        b.addEventListener('pointerdown', (e) => {
          e.preventDefault();
          game.sound.unlock();
          game.sound.horn(true);
        });
        const off = () => game.sound.horn(false);
        b.addEventListener('pointerup', off);
        b.addEventListener('pointercancel', off);
        b.addEventListener('pointerleave', off);
      } else {
        b.addEventListener('click', (e) => {
          e.preventDefault();
          game.action(act === 'reverse' ? 'toggleReverse' : act);
        });
      }
    }
  }

  applyLabels() {}

  fingerAngle(e) {
    const r = this.wheel.getBoundingClientRect();
    return Math.atan2(e.clientX - (r.left + r.width / 2), -(e.clientY - (r.top + r.height / 2)));
  }

  applyWheel() {
    this.wheel.style.transform = `rotate(${this.wheelAngle}rad)`;
    this.input.touch.steer = this.wheelAngle / 2.2;
  }

  update(dt) {
    // self-centring when released
    if (!this.wheelPointer && this.wheelAngle !== 0) {
      const back = dt * 4;
      this.wheelAngle = Math.abs(this.wheelAngle) < back ? 0 : this.wheelAngle - Math.sign(this.wheelAngle) * back;
      this.applyWheel();
    }
    const p = this.game.truck.physics;
    const rev = this.root.querySelector('[data-t="reverse"]');
    rev.textContent = p.direction < 0 ? 'R' : 'D';
    rev.classList.toggle('on', p.direction < 0);
    this.root.querySelector('[data-t="lights"]').classList.toggle('on', this.game.truck.lightsOn);
  }

  setMode(mode) {
    const one = mode === 'one';
    this.root.querySelector('.wheel').hidden = one;
    this.root.querySelector('.pedals').hidden = one;
    this.joy.hidden = !one;
    this.root.querySelector('.tsmall.right').style.right = one ? 'calc(230px + var(--safe-r))' : '';
  }

  setVisible(v) {
    this.root.hidden = !v;
  }
}
