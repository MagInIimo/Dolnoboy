import { makeT, TITLE } from './i18n.js';

// Drives the loading card that index.html shows before the bundle runs.
export class Loading {
  constructor(lang) {
    this.el = document.getElementById('loading');
    this.stageEl = document.getElementById('lstage');
    this.pctEl = document.getElementById('lpct');
    this.barEl = document.getElementById('lbar');
    this.tipEl = document.getElementById('ltip');
    this.retry = document.getElementById('lretry');
    this.progress = 0;
    this.tipIndex = Math.floor(Math.random() * 8);
    this.el.dataset.boot = 'active';
    this.setLang(lang);
    this.tipTimer = setInterval(() => this.nextTip(), 4500);
    // a slow connection: offer a retry without interrupting the load
    this.slowTimer = setTimeout(() => {
      if (this.el.dataset.state) return;
      this.tipEl.textContent = this.t('loadingSlow');
      this.retry.hidden = false;
      this.retry.onclick = () => location.reload();
    }, 45000);
  }

  setLang(lang) {
    this.lang = lang;
    this.t = makeT(lang);
    document.documentElement.lang = lang;
    document.title = TITLE[lang];
    document.getElementById('ltitle').textContent = TITLE[lang];
    document.getElementById('lsub').textContent = this.t('loadingSub');
    this.retry.textContent = this.t('retry');
    this.nextTip();
  }

  nextTip() {
    const tips = this.t('tips');
    if (!Array.isArray(tips) || this.el.dataset.state) return;
    this.tipIndex = (this.tipIndex + 1) % tips.length;
    this.tipEl.textContent = tips[this.tipIndex];
  }

  stage(key, progress) {
    this.stageEl.textContent = this.t(key);
    this.progress = Math.max(this.progress, Math.min(1, progress));
    const pct = Math.round(this.progress * 100);
    this.pctEl.textContent = pct + '%';
    this.barEl.style.width = pct + '%';
  }

  // Yields to the browser so the progress bar can repaint; works in background tabs too.
  frame() {
    return new Promise((resolve) => {
      let done = false;
      const go = () => {
        if (!done) {
          done = true;
          resolve();
        }
      };
      requestAnimationFrame(go);
      setTimeout(go, 50);
    });
  }

  fail(kind = 'loadFailed') {
    clearInterval(this.tipTimer);
    clearTimeout(this.slowTimer);
    this.el.hidden = false;
    this.el.classList.remove('out');
    this.el.dataset.state = 'error';
    this.el.setAttribute('aria-busy', 'false');
    this.stageEl.textContent = this.t(kind === 'noWebgl' ? 'noWebgl' : 'loadFailed');
    this.tipEl.textContent = this.t(kind === 'noWebgl' ? 'noWebglText' : 'loadFailedText');
    this.retry.hidden = kind === 'noWebgl';
    this.retry.onclick = () => location.reload();
  }

  done() {
    clearInterval(this.tipTimer);
    clearTimeout(this.slowTimer);
    this.stage('loadingDone', 1);
    this.el.dataset.state = 'ready';
    this.el.setAttribute('aria-busy', 'false');
    this.el.classList.add('out');
    setTimeout(() => (this.el.hidden = true), 600);
  }
}
