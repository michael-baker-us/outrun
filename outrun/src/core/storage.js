// Persistence helpers wrapping localStorage. All functions accept an optional
// `store` parameter so tests can inject a fake store without DOM or jsdom.

const K_SCORES   = 'outrun_scores';
const K_SETTINGS = 'outrun_settings';
const K_SEED     = 'outrun_last_seed';

function _get(key, store) {
  try { return JSON.parse((store ?? localStorage).getItem(key) ?? 'null'); }
  catch { return null; }
}

function _set(key, val, store) {
  try { (store ?? localStorage).setItem(key, JSON.stringify(val)); } catch {}
}

export function getHighScores(store) {
  return _get(K_SCORES, store) ?? [];
}

export function addHighScore(score, store) {
  const scores = getHighScores(store);
  scores.push({ score, date: Date.now() });
  scores.sort((a, b) => b.score - a.score);
  scores.splice(5); // keep top 5
  _set(K_SCORES, scores, store);
  return scores;
}

export function isHighScore(score, store) {
  const scores = getHighScores(store);
  return scores.length < 5 || score > scores[scores.length - 1].score;
}

export function saveSettings(s, store)  { _set(K_SETTINGS, s, store); }
export function loadSettings(store)     { return _get(K_SETTINGS, store); }
export function saveLastSeed(seed, store) { _set(K_SEED, seed, store); }
export function loadLastSeed(store)     { return _get(K_SEED, store); }
