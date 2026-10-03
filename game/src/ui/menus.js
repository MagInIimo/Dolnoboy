import { ICONS } from './hud.js';
import { TITLE } from './i18n.js';
import { CARGO, COMPANIES, TRAILERS, TRUCKS, UPGRADES, PAINTS, levelForXp, xpForLevel } from '../data/economy.js';
import { formatMoney } from '../core/util.js';
import { drawWorldMap, MapData } from './map.js';
import { SCALE } from '../core/geo.js';

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

const TRAILER_COLOR = { curtain: '#9fb3c2', reefer: '#e6edf0', flatbed: '#c8a06a', tanker: '#d6dbe0', container: '#4f86c6', logger: '#8c6b45', lowloader: '#e0a51c' };

export class Menus {
  constructor(frame, game) {
    this.game = game;
    this.el = document.createElement('div');
    this.el.id = 'overlay';
    this.el.hidden = true;
    frame.appendChild(this.el);
    this.screen = '';
    this.mapData = new MapData(game.world);
    this.mapView = null;
    this.el.addEventListener('click', (e) => {
      const b = e.target.closest('[data-act]');
      if (!b || b.disabled) return;
      e.stopPropagation();
      this.game.sound.chime('tick');
      this.game.menuAction(b.dataset.act, b.dataset.v);
    });
  }

  get open() {
    return !!this.screen;
  }

  show(screen, data = null) {
    this.screen = screen;
    this.data = data;
    if (!screen) {
      this.el.hidden = true;
      this.el.innerHTML = '';
      this.mapCleanup?.();
      return;
    }
    this.el.hidden = false;
    this.render();
  }

  head(title, back = true) {
    return `<div class="sheet-head"><h2>${esc(title)}</h2>${back ? `<button class="icon-btn" data-act="back" aria-label="close">${ICONS.close}</button>` : ''}</div>`;
  }

  render() {
    const g = this.game;
    const t = g.t;
    const fn = this['r_' + this.screen];
    this.mapCleanup?.();
    this.mapCleanup = null;
    this.el.innerHTML = fn ? fn.call(this, g, t) : '';
    if (this.screen === 'map') this.initMap();
  }

  r_pause(g, t) {
    const s = g.state;
    const level = levelForXp(s.xp);
    const lo = xpForLevel(level);
    const hi = xpForLevel(level + 1);
    const title = TITLE[g.lang].split(' ');
    const item = (act, icon, label, cls = '') => `<button class="btn ${cls}" data-act="${act}">${ICONS[icon]}<span>${esc(label)}</span></button>`;
    return `<div class="sheet"><div class="menu">
      <div class="brand">
        <h1>${esc(title[0])}<span>${esc(title.slice(1).join(' '))}</span></h1>
        <div class="who">
          <div class="kv"><small>${t('money')}</small><b>${formatMoney(s.money, g.lang)}</b></div>
          <div class="kv"><small>${t('level')}</small><b>${level}</b><div class="xpbar"><i style="width:${Math.min(100, ((s.xp - lo) / Math.max(1, hi - lo)) * 100).toFixed(0)}%"></i></div></div>
          <div class="kv"><small>${t('deliveries')}</small><b>${s.stats.deliveries}</b></div>
          <div class="kv"><small>${t('distance')}</small><b>${Math.round(s.stats.km).toLocaleString('ru-RU')} ${t('km')}</b></div>
        </div>
        <div style="font-size:13px;color:var(--muted)">${esc(g.currentJobLine())}</div>
      </div>
      <div class="items">
        ${item('resume', 'play', t('resume'), 'primary')}
        ${item('jobs', 'jobs', t('jobs'))}
        ${item('map', 'map', t('map'))}
        ${item('garage', 'garage', t('garage'))}
        ${item('settings', 'settings', t('settings'))}
        ${item('help', 'help', t('help'))}
        ${item('about', 'info', t('about'))}
      </div></div></div>`;
  }

  r_jobs(g, t) {
    const city = g.currentCity();
    const name = (o) => (g.lang === 'en' ? o.en : o.ru);
    if (!city) return `<div class="sheet">${this.head(t('jobs'))}<div class="sheet-body"><div class="empty">${t('free')}</div></div></div>`;
    const offers = g.jobs.offers(city.index, g.state);
    const rows = offers
      .map((o) => {
        const cargo = CARGO[o.cargo];
        const trailer = TRAILERS[cargo.trailer];
        const toCity = g.world.cities[o.to.city];
        const hours = Math.floor(o.deadlineMinutes / 60);
        const mins = o.deadlineMinutes % 60;
        return `<div class="job${o.locked ? ' locked' : ''}">
          <div class="ico" style="background:${TRAILER_COLOR[cargo.trailer]}">${esc(name(cargo).slice(0, 2).toUpperCase())}</div>
          <div><div class="t1">${esc(name(cargo))}${o.urgent ? `<span class="badge">${t('urgent')}</span>` : ''}${cargo.adr ? '<span class="badge adr">ADR</span>' : ''}</div><div class="t2">${esc(name(COMPANIES[o.from.company]))} · ${o.mass} ${t('t')} · ${esc(name(trailer))}</div></div>
          <div><div class="t1">→ ${esc(name(toCity))}</div><div class="t2">${esc(name(COMPANIES[o.to.company]))}</div></div>
          <div><div class="t1">${o.km} ${t('km')}</div><div class="t2">${t('deadline')}: ${hours} ${t('h')} ${mins ? mins + ' ' + t('min') : ''}</div></div>
          <div class="money">${formatMoney(o.pay, g.lang)}</div>
          <div>${o.locked ? `<button class="btn" disabled>${t('locked')} ${o.needLevel}</button>` : `<button class="btn primary" data-act="accept" data-v="${o.id}" ${g.state.job ? 'disabled' : ''}>${t('accept')}</button>`}</div>
        </div>`;
      })
      .join('');
    const active = g.state.job ? `<div class="kv" style="margin-bottom:12px;display:flex;justify-content:space-between;align-items:center;gap:12px"><div><small>${t('activeJob')}</small><b>${esc(g.currentJobLine())}</b></div><button class="btn danger" data-act="cancelJob">${t('cancelJob')}</button></div>` : '';
    return `<div class="sheet">${this.head(t('jobMarketIn', { city: name(city) }))}<div class="sheet-body">${active}<div class="jobs">${rows || `<div class="empty">${t('noJobs')}</div>`}</div></div></div>`;
  }

  r_map(g, t) {
    return `<div class="sheet full">${this.head(t('map'))}<div class="map-wrap"><canvas></canvas><div class="map-zoom"><button class="icon-btn" data-act="zoomIn">${ICONS.plus}</button><button class="icon-btn" data-act="zoomOut">${ICONS.minus}</button><button class="icon-btn" data-act="mapCenter">${ICONS.target}</button></div><div class="map-side panel" hidden></div></div></div>`;
  }

  initMap() {
    const g = this.game;
    const canvas = this.el.querySelector('.map-wrap canvas');
    const side = this.el.querySelector('.map-side');
    const p = g.truck.physics;
    if (!this.mapView) this.mapView = { cx: p.x, cz: p.z, scale: 0.012 };
    else {
      this.mapView.cx = p.x;
      this.mapView.cz = p.z;
    }
    const view = this.mapView;
    let raf = 0;
    const draw = () => {
      raf = 0;
      const r = canvas.getBoundingClientRect();
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.round(r.width * dpr);
      canvas.height = Math.round(r.height * dpr);
      const ctx = canvas.getContext('2d');
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const job = g.state.job;
      drawWorldMap(ctx, r.width, r.height, view, this.mapData, {
        lang: g.lang,
        route: g.nav.route,
        player: { x: p.x, z: p.z, yaw: p.yaw },
        selected: this.selectedCity ?? -1,
        jobCity: job ? (job.stage === 'pickup' ? job.from.city : job.to.city) : -1,
        markers: g.world.lots.filter((l) => l.kind === 'fuel' || l.kind === 'service').map((l) => ({ x: l.x, z: l.z, color: l.kind === 'fuel' ? '#3ac46a' : '#4b8dff', r: 3 })),
      });
    };
    const request = () => {
      if (!raf) raf = requestAnimationFrame(draw);
    };
    this.redrawMap = request;
    request();
    const pointers = new Map();
    let moved = 0;
    const toWorld = (cx, cy) => {
      const r = canvas.getBoundingClientRect();
      return { x: view.cx + (cx - r.left - r.width / 2) / view.scale, z: view.cz + (cy - r.top - r.height / 2) / view.scale };
    };
    const down = (e) => {
      canvas.setPointerCapture(e.pointerId);
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      moved = 0;
    };
    const move = (e) => {
      if (!pointers.has(e.pointerId)) return;
      const prev = pointers.get(e.pointerId);
      if (pointers.size === 1) {
        view.cx -= (e.clientX - prev.x) / view.scale;
        view.cz -= (e.clientY - prev.y) / view.scale;
        moved += Math.abs(e.clientX - prev.x) + Math.abs(e.clientY - prev.y);
      } else if (pointers.size === 2) {
        const other = [...pointers.entries()].find(([id]) => id !== e.pointerId)[1];
        const d0 = Math.hypot(prev.x - other.x, prev.y - other.y);
        const d1 = Math.hypot(e.clientX - other.x, e.clientY - other.y);
        if (d0 > 0) view.scale = Math.min(0.5, Math.max(0.004, view.scale * (d1 / d0)));
        moved += 20;
      }
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      request();
    };
    const up = (e) => {
      if (pointers.has(e.pointerId) && moved < 6 && pointers.size === 1) {
        const w = toWorld(e.clientX, e.clientY);
        let best = null;
        for (const c of g.world.cities) {
          const d = Math.hypot(c.x - w.x, c.z - w.z) * view.scale;
          if (d < 18 && (!best || d < best.d)) best = { c, d };
        }
        this.selectedCity = best ? best.c.index : null;
        this.renderSide(side);
        request();
      }
      pointers.delete(e.pointerId);
    };
    const wheel = (e) => {
      e.preventDefault();
      const before = toWorld(e.clientX, e.clientY);
      view.scale = Math.min(0.5, Math.max(0.004, view.scale * (e.deltaY < 0 ? 1.18 : 1 / 1.18)));
      const after = toWorld(e.clientX, e.clientY);
      view.cx += before.x - after.x;
      view.cz += before.z - after.z;
      request();
    };
    canvas.addEventListener('pointerdown', down);
    canvas.addEventListener('pointermove', move);
    canvas.addEventListener('pointerup', up);
    canvas.addEventListener('pointercancel', up);
    canvas.addEventListener('wheel', wheel, { passive: false });
    const resize = () => request();
    window.addEventListener('resize', resize);
    this.mapCleanup = () => {
      window.removeEventListener('resize', resize);
      if (raf) cancelAnimationFrame(raf);
    };
    this.renderSide(side);
  }

  renderSide(side) {
    const g = this.game;
    const t = g.t;
    const c = g.world.cities[this.selectedCity];
    if (!c) {
      side.hidden = true;
      return;
    }
    side.hidden = false;
    const name = (o) => (g.lang === 'en' ? o.en : o.ru);
    const companies = c.lots.filter((l) => l.kind === 'company').map((l) => name(COMPANIES[l.company]));
    const here = g.currentCity();
    const km = here ? g.jobs.km(here.index, c.index) : null;
    side.innerHTML = `<h3>${esc(name(c))}</h3>
      <div class="row">${t('companies')}: ${companies.length}</div>
      <div class="row">${esc(companies.slice(0, 6).join(', '))}</div>
      ${km !== null && here.index !== c.index ? `<div class="row">${t('distance')}: ~${km} ${t('km')}</div>` : ''}
      <div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap"><button class="btn primary" data-act="gpsCity" data-v="${c.index}" ${g.state.job ? 'disabled' : ''}>${t('setGps')}</button></div>`;
  }

  zoomMap(f) {
    if (!this.mapView) return;
    this.mapView.scale = Math.min(0.5, Math.max(0.004, this.mapView.scale * f));
    this.redrawMap?.();
  }

  centerMap() {
    const p = this.game.truck.physics;
    this.mapView.cx = p.x;
    this.mapView.cz = p.z;
    this.redrawMap?.();
  }

  r_garage(g, t) {
    const s = g.state;
    const name = (o) => (g.lang === 'en' ? o.en : o.ru);
    const tab = this.data?.tab ?? 'upgrades';
    const tabs = ['upgrades', 'paint', 'trucks'].map((k) => `<button class="tab ${tab === k ? 'on' : ''}" data-act="garageTab" data-v="${k}">${t(k)}</button>`).join('');
    let body = '';
    const atService = g.atService();
    if (tab === 'upgrades') {
      body = `<div class="cards">${Object.entries(UPGRADES)
        .map(([id, u]) => {
          const lvl = s.truck.upgrades[id] ?? 0;
          const max = u.steps.length - 1;
          const price = u.steps[lvl + 1];
          return `<div class="card"><h4>${esc(name(u))}</h4><div class="steps">${u.steps.slice(1).map((_, i) => `<i class="${i < lvl ? 'on' : ''}"></i>`).join('')}</div>
          ${lvl >= max ? `<button class="btn" disabled>${t('maxed')}</button>` : `<button class="btn primary" data-act="upgrade" data-v="${id}" ${s.money < price ? 'disabled' : ''}>${t('buy')} · ${formatMoney(price, g.lang)}</button>`}</div>`;
        })
        .join('')}</div>`;
    } else if (tab === 'paint') {
      body = `<div class="swatches" style="padding-bottom:20px">${PAINTS.map((p) => {
        const owned = s.truck.paints.includes(p.id);
        return `<button class="swatch ${s.truck.paint === p.id ? 'on' : ''}" style="background:${p.color}" data-act="paint" data-v="${p.id}" title="${esc(name(p))}"><small>${owned ? esc(name(p)) : formatMoney(p.price, g.lang)}</small></button>`;
      }).join('')}</div>`;
    } else {
      body = `<div class="cards">${Object.entries(TRUCKS)
        .map(([id, tr]) => {
          const owned = s.truck.owned.includes(id);
          const current = s.truck.model === id;
          return `<div class="card"><h4>${esc(name(tr))}</h4><div class="sub">${t('power')}: ${tr.power} ${t('hp')} · ${tr.torque} Н·м</div>
          ${current ? `<button class="btn" disabled>${t('current')}</button>` : owned ? `<button class="btn primary" data-act="truck" data-v="${id}">${t('select')}</button>` : `<button class="btn primary" data-act="truck" data-v="${id}" ${s.money < tr.price ? 'disabled' : ''}>${t('buy')} · ${formatMoney(tr.price, g.lang)}</button>`}</div>`;
        })
        .join('')}</div>`;
    }
    const repairCost = g.repairCost();
    const svc = atService
      ? `<div style="display:flex;gap:8px;margin-bottom:14px;flex-wrap:wrap"><button class="btn primary" data-act="repair" ${repairCost <= 0 || s.money < repairCost ? 'disabled' : ''}>${t('repair')} · ${formatMoney(repairCost, g.lang)}</button>${g.platform.hasAds ? `<button class="btn ad" data-act="adRepair" ${repairCost <= 0 ? 'disabled' : ''}>${t('rewardRepair')}</button>` : ''}</div>`
      : '';
    const ad = g.platform.hasAds ? `<button class="btn ad" data-act="adCash">${t('rewardCash', { amount: formatMoney(g.rewardAmount(), g.lang) })}</button>` : '';
    return `<div class="sheet">${this.head(t('garage'))}<div class="sheet-body"><div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;margin-bottom:14px"><div class="tabs">${tabs}</div><div style="display:flex;gap:8px;align-items:center"><div class="kv"><small>${t('money')}</small><b>${formatMoney(s.money, g.lang)}</b></div>${ad}</div></div>${svc}${body}</div></div>`;
  }

  r_settings(g, t) {
    const s = g.state.settings;
    const seg = (key, options) => `<div class="seg">${options.map(([v, label]) => `<button class="tab ${String(s[key]) === String(v) ? 'on' : ''}" data-act="setting" data-v="${key}:${v}">${esc(label)}</button>`).join('')}</div>`;
    return `<div class="sheet">${this.head(t('settings'))}<div class="sheet-body">
      <div class="setting"><span>🌐 ${t('language')}</span><div class="seg"><button class="tab ${g.lang === 'ru' ? 'on' : ''}" data-act="lang" data-v="ru">Русский</button><button class="tab ${g.lang === 'en' ? 'on' : ''}" data-act="lang" data-v="en">English</button></div></div>
      <div class="setting"><span>${t('quality')}</span>${seg('quality', [['low', t('low')], ['medium', t('medium')], ['high', t('high')]])}</div>
      <div class="setting"><span>${t('sound')}</span>${seg('sound', [[true, t('on')], [false, t('off')]])}</div>
      <div class="setting"><span>${t('volume')}</span>${seg('volume', [[0.3, '30%'], [0.6, '60%'], [0.8, '80%'], [1, '100%']])}</div>
      <div class="setting"><span>${t('controls')}</span>${seg('controls', [['two', t('twoHands')], ['one', t('oneHand')]])}</div>
    </div></div>`;
  }

  r_help(g, t) {
    const en = g.lang === 'en';
    const keys = en
      ? [['W / ↑', 'Throttle'], ['S / ↓', 'Brake, hold to reverse'], ['A D / ← →', 'Steer'], ['Space', 'Parking brake'], ['T', 'Couple / uncouple trailer'], ['Enter / F', 'Action: deliver, refuel, repair'], ['Q / E', 'Turn signals'], ['X', 'Hazard lights'], ['L / K', 'Headlights / high beam'], ['H', 'Horn'], ['C', 'Cruise control'], ['R', 'Retarder'], ['V, 1-3', 'Cameras'], ['Mouse drag / wheel', 'Look around / zoom'], ['M', 'Map'], ['J', 'Freight market'], ['G', 'Garage'], ['P / Esc', 'Pause']]
      : [['W / ↑', 'Газ'], ['S / ↓', 'Тормоз, удерживать — задний ход'], ['A D / ← →', 'Руль'], ['Пробел', 'Стояночный тормоз'], ['T', 'Подцепить / отцепить прицеп'], ['Enter / F', 'Действие: сдать груз, заправка, ремонт'], ['Q / E', 'Поворотники'], ['X', 'Аварийка'], ['L / K', 'Фары / дальний свет'], ['H', 'Сигнал'], ['C', 'Круиз-контроль'], ['R', 'Ретардер'], ['V, 1–3', 'Камеры'], ['Мышь / колесо', 'Обзор / приближение'], ['M', 'Карта'], ['J', 'Биржа грузов'], ['G', 'Гараж'], ['P / Esc', 'Пауза']];
    const text = en
      ? 'Take a job at the freight market, drive to the depot and reverse under the trailer to couple it. Follow the GPS to the destination company and park the trailer on the marked bay. Watch the speed limits, fuel and deadlines: payment depends on punctuality and cargo condition. Earn money and experience to unlock heavier and more valuable cargo, upgrade your truck and buy new ones. On touch screens drive with the on-screen wheel and pedals, or switch to one-handed joystick mode in the settings.'
      : 'Возьмите заказ на бирже грузов, доберитесь до склада и подъедьте задним ходом под прицеп, чтобы подцепить его. Следуйте навигатору к компании-получателю и поставьте прицеп на размеченное место. Следите за ограничениями скорости, топливом и сроками: оплата зависит от пунктуальности и сохранности груза. Зарабатывайте деньги и опыт, чтобы открывать тяжёлые и дорогие грузы, улучшать грузовик и покупать новые. На сенсорных экранах управляйте экранным рулём и педалями или включите режим «одной рукой» в настройках.';
    return `<div class="sheet">${this.head(t('help'))}<div class="sheet-body"><p class="prose">${esc(text)}</p><div class="help-grid">${keys.map(([k, v]) => `<div><kbd>${esc(k)}</kbd><span>${esc(v)}</span></div>`).join('')}</div></div></div>`;
  }

  r_about(g, t) {
    return `<div class="sheet">${this.head(t('about'))}<div class="sheet-body"><p class="prose">${esc(t('aboutText'))}</p><button class="btn" data-act="licenses">${t('licenses')}</button>${this.data?.licenses ? `<pre class="lic">${esc(this.data.licenses)}</pre>` : ''}</div></div>`;
  }

  r_result(g, t) {
    const r = this.data;
    const pct = (v) => Math.round(v * 100) + '%';
    return `<div class="sheet" style="width:min(720px,100%)">${this.head(t('delivered'), false)}<div class="sheet-body"><div class="result">
      <div><small style="color:var(--muted)">${t('earnedLabel')}</small><div class="big">${formatMoney(r.pay, g.lang)}</div><div style="margin-top:6px;color:var(--muted)">+${r.xp} ${t('xp')}</div>${r.levelUp ? `<div class="kv" style="margin-top:12px"><b>${t('levelUp', { level: r.levelUp })}</b></div>` : ''}</div>
      <div class="lines">
        <div><span>${t('cargo')}</span><b>${esc(r.cargo)}</b></div>
        <div><span>${t('distance')}</span><b>${r.km} ${t('km')}</b></div>
        <div><span>${t('late')}</span><b>${r.late > 0 ? '−' + pct(r.latePenalty) : '—'}</b></div>
        <div><span>${t('damage')}</span><b>${r.damagePenalty > 0 ? '−' + pct(r.damagePenalty) : '—'}</b></div>
        <div><span>${t('parking')}</span><b>${t(r.parking)}${r.parkingBonus ? ' +' + pct(r.parkingBonus) : ''}</b></div>
      </div></div>
      <div style="display:flex;gap:8px;margin-top:16px;flex-wrap:wrap"><button class="btn primary" data-act="jobs">${t('jobs')}</button><button class="btn" data-act="resume">${t('continueDrive')}</button></div></div></div>`;
  }

  r_confirm(g, t) {
    const d = this.data;
    return `<div class="sheet" style="width:min(520px,100%)">${this.head(d.title, false)}<div class="sheet-body"><p class="prose">${esc(d.text)}</p><div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn primary" data-act="${d.yes}">${d.yesLabel ?? t('yes')}</button><button class="btn" data-act="back">${t('no')}</button></div></div></div>`;
  }
}
