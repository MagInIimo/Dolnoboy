import { Platform } from './core/platform.js';
import { World } from './world/world.js';
import { Game } from './game/game.js';
import { Loading } from './ui/loading.js';

function hasWebGL2() {
  try {
    return !!document.createElement('canvas').getContext('webgl2');
  } catch {
    return false;
  }
}

function guessLang() {
  if (document.documentElement.lang === 'en') return 'en';
  return /^(ru|be|kk|uk|uz)/i.test(navigator.language || 'ru') ? 'ru' : 'en';
}

async function boot() {
  const loading = new Loading(guessLang());
  window.__loading = loading;
  if (!hasWebGL2()) {
    loading.fail('noWebgl');
    return;
  }
  loading.stage('loadingSdk', 0.02);
  const platform = new Platform();
  const state = await platform.init();
  loading.setLang(state.lang);
  loading.stage('loadingWorld', 0.06);
  await loading.frame();
  await document.fonts?.load("700 40px 'Source Sans'").catch(() => null);
  const world = new World();
  loading.stage('loadingWorld', 0.3);
  await loading.frame();
  const game = new Game(document.getElementById('frame'), platform, state, loading);
  await game.init(world);
  loading.done();
  platform.ready();
}

boot().catch((e) => {
  console.error(e);
  (window.__loading ?? null)?.fail('loadFailed') ?? window.__bootFail?.();
});
