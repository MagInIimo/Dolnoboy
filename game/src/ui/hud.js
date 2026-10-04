import { Minimap } from './map.js';
import { formatMoney } from '../core/util.js';
import { CARGO, COMPANIES } from '../data/economy.js';
import { GAME_HOURS_PER_KM, SCALE } from '../core/geo.js';

export const ICONS = {
  map: '<svg viewBox="0 0 24 24"><path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2z"/><path d="M9 4v14M15 6v14"/></svg>',
  jobs: '<svg viewBox="0 0 24 24"><rect x="3" y="7" width="18" height="13" rx="2"/><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M3 12h18"/></svg>',
  camera: '<svg viewBox="0 0 24 24"><path d="M3 8h4l2-3h6l2 3h4v11H3z"/><circle cx="12" cy="13" r="3.5"/></svg>',
  pause: '<svg viewBox="0 0 24 24"><path d="M8 5v14M16 5v14"/></svg>',
  garage: '<svg viewBox="0 0 24 24"><path d="M3 10 12 4l9 6v10H3z"/><path d="M7 20v-6h10v6"/></svg>',
  profile: '<svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="4"/><path d="M4 21c1-4 4-6 8-6s7 2 8 6"/></svg>',
  settings: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1 7 17M17 7l2.1-2.1"/></svg>',
  help: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6V14M12 17.5v.5"/></svg>',
  play: '<svg viewBox="0 0 24 24"><path d="M7 4v16l13-8z"/></svg>',
  info: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/></svg>',
  close: '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg>',
  plus: '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>',
  minus: '<svg viewBox="0 0 24 24"><path d="M5 12h14"/></svg>',
  target: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="2"/></svg>',
};

// Telltales drawn like the symbols of a real instrument cluster (ISO 2575 shapes, simplified).
const TT = {
  indL: '<svg viewBox="0 0 24 24"><path d="M3 12l8-7v4h10v6H11v4z"/></svg>',
  indR: '<svg viewBox="0 0 24 24"><path d="M21 12l-8-7v4H3v6h10v4z"/></svg>',
  low: '<svg viewBox="0 0 24 24"><path class="s" d="M14 5c4 0 7 3 7 7s-3 7-7 7c-1.2 0-2-.6-2-2V7c0-1.4.8-2 2-2z"/><path class="s" d="M9 7 3 9M9 11 3 13M9 15 3 17"/></svg>',
  high: '<svg viewBox="0 0 24 24"><path class="s" d="M14 5c4 0 7 3 7 7s-3 7-7 7c-1.2 0-2-.6-2-2V7c0-1.4.8-2 2-2z"/><path class="s" d="M9 7H3M9 12H3M9 17H3"/></svg>',
  cruise: '<svg viewBox="0 0 24 24"><path class="s" d="M5 17a8 8 0 1 1 14 0"/><path class="s" d="M12 13l4-5"/><circle cx="12" cy="13" r="1.6"/></svg>',
  park: '<svg viewBox="0 0 24 24"><circle class="s" cx="12" cy="12" r="8"/><path class="s" d="M4 6a11 11 0 0 0 0 12M20 6a11 11 0 0 1 0 12"/><path d="M10 8h3a2.5 2.5 0 0 1 0 5h-1.6V16H10z"/></svg>',
  ret: '<svg viewBox="0 0 24 24"><path class="s" d="M4 12a8 8 0 0 1 16 0"/><path class="s" d="M12 12V6M8 9l2 2M16 9l-2 2"/></svg>',
  fuel: '<svg viewBox="0 0 24 24"><path class="s" d="M5 20V5a1 1 0 0 1 1-1h7a1 1 0 0 1 1 1v15M4 20h11M5 10h9M14 8l3 2v7a1.5 1.5 0 0 0 3 0V9l-2-3"/></svg>',
  wrench: '<svg viewBox="0 0 24 24"><path class="s" d="M14.5 6.5a4 4 0 0 0 5 5L12 19a2.1 2.1 0 0 1-3-3l7.5-7.5a4 4 0 0 1-5-5l2.5 2.5 2-2z"/></svg>',
};

const ARROWS = {
  left: '<svg viewBox="0 0 40 40"><path d="M26 34V20a6 6 0 0 0-6-6H10" stroke="#ffcf5c" stroke-width="5" fill="none" stroke-linecap="round"/><path d="M15 7 8 14l7 7" stroke="#ffcf5c" stroke-width="5" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  right: '<svg viewBox="0 0 40 40"><path d="M14 34V20a6 6 0 0 1 6-6h10" stroke="#ffcf5c" stroke-width="5" fill="none" stroke-linecap="round"/><path d="M25 7l7 7-7 7" stroke="#ffcf5c" stroke-width="5" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  straight: '<svg viewBox="0 0 40 40"><path d="M20 34V8" stroke="#ffcf5c" stroke-width="5" fill="none" stroke-linecap="round"/><path d="M13 15l7-7 7 7" stroke="#ffcf5c" stroke-width="5" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  flag: '<svg viewBox="0 0 40 40"><path d="M10 35V6" stroke="#ffcf5c" stroke-width="4" stroke-linecap="round"/><path d="M11 7h18l-4 6 4 6H11z" fill="#ffcf5c"/></svg>',
};

export class Hud {
  constructor(frame, game) {
    this.game = game;
    this.t = game.t;
    const root = document.createElement('div');
    root.id = 'hud';
    root.innerHTML = `
      <div class="job-card" hidden><div class="label"></div><div class="route"></div><div class="meta"></div></div>
      <div class="maneuver" hidden><span class="ma"></span><div><div class="md"></div><div class="mt"></div></div></div>
      <div class="toolbar">
        <div class="money-chip pe" data-ui="profile"><small>₽</small><span class="money"></span></div>
        <button class="tbtn pe" data-ui="jobs" aria-label="jobs">${ICONS.jobs}</button>
        <button class="tbtn pe" data-ui="map" aria-label="map">${ICONS.map}</button>
        <button class="tbtn pe" data-ui="camera" aria-label="camera">${ICONS.camera}</button>
        <button class="tbtn pe" data-ui="pause" aria-label="pause">${ICONS.pause}</button>
      </div>
      <div class="notes"></div>
      <div class="nav">
        <div class="screen pe" data-ui="map"><canvas width="320" height="196"></canvas>
          <div class="eta"><b class="gd"></b><small class="gt"></small></div>
        </div>
        <div class="navbar">
          <div class="limit"><b>90</b></div>
          <div class="cur"><b class="spd">0</b><small class="spdu"></small></div>
          <div class="gear">N</div>
          <div class="clock"><b class="clk"></b><small class="day"></small></div>
        </div>
        <div class="status">
          <div class="meter fuel">${TT.fuel}<div class="seg">${'<i></i>'.repeat(10)}</div></div>
          <div class="meter dmg">${TT.wrench}<b class="dmgv">0%</b></div>
          <div class="tts">
            <i class="tt green tt-ind-l">${TT.indL}</i><i class="tt green tt-low">${TT.low}</i><i class="tt blue tt-high">${TT.high}</i><i class="tt green tt-cruise">${TT.cruise}</i><i class="tt amber tt-ret">${TT.ret}<em>0</em></i><i class="tt red tt-park">${TT.park}</i><i class="tt green tt-ind-r">${TT.indR}</i>
          </div>
        </div>
      </div>
      <button class="context" hidden></button>
      <div id="flash"></div>
      <div class="busy panel" hidden><i></i><span></span></div>
    `;
    frame.appendChild(root);
    this.root = root;
    this.q = (s) => root.querySelector(s);
    this.minimap = new Minimap(this.q('.nav canvas'), game.world);
    this.segs = [...root.querySelectorAll('.fuel .seg i')];
    root.addEventListener('click', (e) => {
      const el = e.target.closest('[data-ui]');
      if (el) game.action(el.dataset.ui);
    });
    this.context = this.q('.context');
    this.context.addEventListener('click', (e) => {
      e.stopPropagation();
      game.action('interact');
    });
    this.notes = this.q('.notes');
    this.lastKey = '';
    this.applyLanguage();
  }

  applyLanguage() {
    const t = this.game.t;
    this.q('.spdu').textContent = this.game.lang === 'en' ? 'km/h' : 'км/ч';
    this.q('.fuel').title = t('fuel');
    this.q('.dmg').title = t('damage');
  }

  notify(text, kind = '') {
    const n = document.createElement('div');
    n.className = 'note panel ' + kind;
    n.textContent = text;
    this.notes.prepend(n);
    while (this.notes.children.length > 4) this.notes.lastChild.remove();
    setTimeout(() => n.remove(), 5200);
  }

  // Small centred notice while the game waits for the world (null hides it).
  setBusy(text) {
    const el = this.q('.busy');
    el.hidden = !text;
    if (text) el.querySelector('span').textContent = text;
  }

  flash() {
    const f = this.q('#flash');
    f.style.transition = 'none';
    f.style.opacity = '0.85';
    requestAnimationFrame(() => {
      f.style.transition = 'opacity .6s';
      f.style.opacity = '0';
    });
  }

  setContext(action, label, key) {
    const k = action + label;
    if (k === this.lastKey) return;
    this.lastKey = k;
    if (!action) {
      this.context.hidden = true;
      return;
    }
    this.context.hidden = false;
    this.context.className = 'context' + (action === 'info' ? ' info' : '');
    this.context.innerHTML = `<span></span>${key && !this.game.touch ? `<kbd>${key}</kbd>` : ''}`;
    this.context.firstChild.textContent = label;
  }

  update(dt) {
    const g = this.game;
    const t = g.t;
    const p = g.truck.physics;
    const s = g.state;
    const speed = Math.abs(p.v) * 3.6;
    const limit = g.speedLimit ?? 90;
    this.q('.spd').textContent = String(Math.round(speed));
    this.q('.cur').classList.toggle('over', speed > limit + 3);
    const gear = p.gear < 0 ? 'R' : p.gear === 0 ? 'N' : p.automatic ? 'A' + p.gear : String(p.gear);
    this.q('.gear').textContent = gear;
    const fuel = Math.max(0, Math.min(1, p.fuel / p.tank));
    const lit = Math.ceil(fuel * 10 - 0.05);
    this.segs.forEach((el, i) => (el.className = i < lit ? (fuel < 0.15 ? 'on low' : 'on') : ''));
    this.q('.dmgv').textContent = Math.round(p.damage * 100) + '%';
    this.q('.dmg').classList.toggle('warn', p.damage > 0.3);
    const blink = g.truck.blink % 0.8 < 0.42;
    const tt = (cls, on) => this.q(cls).classList.toggle('on', !!on);
    tt('.tt-ind-l', (g.truck.indicator < 0 || g.truck.hazard) && blink);
    tt('.tt-ind-r', (g.truck.indicator > 0 || g.truck.hazard) && blink);
    tt('.tt-low', g.truck.lightsOn && !g.truck.highBeam);
    tt('.tt-high', g.truck.lightsOn && g.truck.highBeam);
    tt('.tt-cruise', p.cruise > 0);
    tt('.tt-ret', p.retarder > 0);
    this.q('.tt-ret em').textContent = p.retarder > 0 ? String(p.retarder) : '';
    tt('.tt-park', p.parking);
    this.root.classList.toggle('cab', g.rig?.mode === 'cab');
    this.q('.money').textContent = formatMoney(s.money, g.lang).replace(/ ?₽| RUB/, '');
    // speed limit
    this.q('.limit b').textContent = String(limit);
    // clock and day
    const minutes = Math.floor(s.time % 1440);
    this.q('.clk').textContent = `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
    this.q('.day').textContent = `${g.lang === 'en' ? 'day' : 'день'} ${Math.floor(s.time / 1440) + 1} · ${g.weatherName()}`;
    // navigation
    const nav = g.nav;
    const route = nav.route;
    if (route) {
      const realKm = (nav.remaining * SCALE) / 1000;
      this.q('.gd').textContent = realKm >= 10 ? `${Math.round(realKm)} ${t('km')}` : `${realKm.toFixed(1)} ${t('km')}`;
      const hours = realKm * GAME_HOURS_PER_KM;
      const etaMin = Math.round(hours * 60);
      const eh = Math.floor(etaMin / 60);
      this.q('.gt').textContent = `${eh ? eh + ' ' + t('h') + ' ' : ''}${etaMin % 60} ${t('min')} · ${g.targetLabel ?? ''}`;
      this.q('.eta').hidden = false;
    } else {
      this.q('.eta').hidden = true;
    }
    const man = this.q('.maneuver');
    const next = nav.next;
    if (route && next && nav.along !== undefined) {
      const d = next.d - nav.along;
      if (d < 420 && d > -5) {
        man.hidden = false;
        // turn prompts use on-screen metres so the player can judge the distance by eye
        const meters = Math.max(0, Math.round(d / 10) * 10);
        this.q('.ma').innerHTML = ARROWS[next.kind] ?? ARROWS.straight;
        this.q('.md').textContent = d < 25 ? (next.kind === 'left' ? '←' : next.kind === 'right' ? '→' : '↑') : t('inMeters', { d: meters });
        this.q('.mt').textContent = next.kind === 'left' ? t('turnLeft') : next.kind === 'right' ? t('turnRight') : t('straight');
      } else man.hidden = true;
    } else if (route && nav.remaining < 160) {
      man.hidden = false;
      this.q('.ma').innerHTML = ARROWS.flag;
      this.q('.md').textContent = t('arrive');
      this.q('.mt').textContent = g.targetLabel ?? '';
    } else man.hidden = true;
    // job card
    const card = this.q('.job-card');
    const job = s.job;
    if (job) {
      card.hidden = false;
      const cargo = CARGO[job.cargo];
      const from = g.world.cities[job.from.city];
      const to = g.world.cities[job.to.city];
      const name = (o) => (g.lang === 'en' ? o.en : o.ru);
      this.q('.job-card .label').textContent = job.stage === 'pickup' ? t('pickupTarget', { company: '', city: '' }).replace(/[:,\s]+$/, '') : t('activeJob');
      this.q('.job-card .route').textContent = `${name(from)} → ${name(to)}`;
      const left = job.deadline - s.time;
      const late = left < 0;
      card.classList.toggle('late', late);
      const lh = Math.floor(Math.abs(left) / 60);
      const lm = Math.floor(Math.abs(left) % 60);
      this.q('.job-card .meta').innerHTML = '';
      const meta = this.q('.job-card .meta');
      meta.append(`${name(cargo)} · ${job.mass} ${t('t')} · `);
      const b = document.createElement('b');
      b.textContent = `${late ? '−' : ''}${lh} ${t('h')} ${lm} ${t('min')}`;
      meta.append(b);
      meta.append(document.createElement('br'));
      meta.append(`${name(COMPANIES[job.stage === 'pickup' ? job.from.company : job.to.company])}`);
    } else card.hidden = true;
    this.minimapTimer = (this.minimapTimer ?? 0) - dt;
    if (this.minimapTimer <= 0) {
      this.minimapTimer = 1 / 20;
      this.minimap.draw({ x: p.x, z: p.z, yaw: p.yaw }, route, g.navTarget, speed, g.nearbyLots());
    }
  }
}
