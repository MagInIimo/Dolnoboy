import { SAVE_KEY, freshState, sanitize } from '../game/state.js';

// Yandex Games SDK wrapper. Every call is guarded: the game must run without the SDK.
const bounded = (p, ms, fallback) => Promise.race([Promise.resolve(p).catch(() => fallback), new Promise((r) => setTimeout(() => r(fallback), ms))]);

export class Platform {
  constructor() {
    this.sdk = null;
    this.player = null;
    this.pauses = new Set();
    this.listeners = [];
    this.readySent = false;
    this.playing = false;
    this.adBusy = false;
    this.lastInterstitial = Date.now();
    this.pending = null;
    this.cloudWriting = false;
    this.lastCloud = 0;
    this.mobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && /Mac/.test(navigator.platform));
  }

  readLocal() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      return raw ? sanitize(JSON.parse(raw)) : null;
    } catch {
      return null;
    }
  }

  async init() {
    let local = this.readLocal();
    if (window.YaGames?.init) {
      this.sdk = await bounded(window.YaGames.init(), 8000, null);
    }
    const sdk = this.sdk;
    let lang = navigator.language?.startsWith('ru') ? 'ru' : 'en';
    if (sdk) {
      const sdkLang = sdk.environment?.i18n?.lang;
      if (sdkLang) lang = ['ru', 'be', 'kk', 'uk', 'uz'].includes(sdkLang) ? 'ru' : 'en';
      try {
        this.mobile = sdk.deviceInfo?.isMobile?.() || sdk.deviceInfo?.isTablet?.() || false;
      } catch {}
      try {
        sdk.on('game_api_pause', () => this.pause('platform', true));
        sdk.on('game_api_resume', () => this.pause('platform', false));
      } catch {}
      this.player = await bounded(sdk.getPlayer?.(), 6000, null);
      if (this.player) {
        const cloud = await bounded(this.player.getData(['save']), 6000, null);
        if (cloud?.save) {
          const saved = sanitize(cloud.save);
          if (!local || saved.updatedAt > local.updatedAt) local = saved;
        }
      }
    }
    this.lang = lang;
    return local ?? freshState(lang);
  }

  pause(reason, on) {
    const had = this.pauses.size > 0;
    if (on) this.pauses.add(reason);
    else this.pauses.delete(reason);
    if (had !== this.pauses.size > 0) for (const fn of this.listeners) fn(this.pauses.size > 0);
  }

  onPause(fn) {
    this.listeners.push(fn);
  }

  ready() {
    if (this.readySent) return;
    this.readySent = true;
    try {
      this.sdk?.features?.LoadingAPI?.ready();
    } catch {}
  }

  gameplay(on) {
    if (on === this.playing) return;
    this.playing = on;
    try {
      this.sdk?.features?.GameplayAPI?.[on ? 'start' : 'stop']();
    } catch {}
  }

  save(state, force = false) {
    state.updatedAt = Date.now();
    const snapshot = JSON.stringify(state);
    try {
      localStorage.setItem(SAVE_KEY, snapshot);
    } catch {}
    this.pending = snapshot;
    if (force || Date.now() - this.lastCloud > 20000) this.flush();
  }

  async flush() {
    if (!this.player || !this.pending || this.cloudWriting) return;
    this.cloudWriting = true;
    const data = this.pending;
    this.pending = null;
    this.lastCloud = Date.now();
    try {
      await bounded(this.player.setData({ save: JSON.parse(data) }, true), 8000, null);
    } catch {
      this.pending = this.pending ?? data;
    }
    this.cloudWriting = false;
  }

  // Rewarded video: resolves true only if onRewarded fired.
  rewarded() {
    if (!this.sdk?.adv?.showRewardedVideo || this.adBusy) return Promise.resolve(false);
    this.adBusy = true;
    this.pause('ad', true);
    return new Promise((resolve) => {
      let rewarded = false;
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        this.adBusy = false;
        this.pause('ad', false);
        resolve(rewarded);
      };
      const timer = setTimeout(finish, 90000);
      try {
        this.sdk.adv.showRewardedVideo({
          callbacks: {
            onOpen: () => this.pause('ad', true),
            onRewarded: () => {
              rewarded = true;
            },
            onClose: finish,
            onError: finish,
          },
        });
      } catch {
        finish();
      }
    });
  }

  // Interstitial at logical pauses only (after a delivery), with our own cooldown.
  interstitial() {
    if (!this.sdk?.adv?.showFullscreenAdv || this.adBusy || Date.now() - this.lastInterstitial < 180000) return Promise.resolve(false);
    this.adBusy = true;
    this.lastInterstitial = Date.now();
    this.pause('ad', true);
    return new Promise((resolve) => {
      let done = false;
      const finish = (shown) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        this.adBusy = false;
        this.pause('ad', false);
        resolve(!!shown);
      };
      const timer = setTimeout(() => finish(false), 20000);
      try {
        this.sdk.adv.showFullscreenAdv({ callbacks: { onOpen: () => this.pause('ad', true), onClose: (shown) => finish(shown), onError: () => finish(false) } });
      } catch {
        finish(false);
      }
    });
  }

  get hasAds() {
    return !!this.sdk?.adv;
  }
}
