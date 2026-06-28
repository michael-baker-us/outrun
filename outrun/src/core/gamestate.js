// Simple state machine for game flow: title → playing ↔ paused/settings → gameover → title

let _state = 'title';
const _enter = {};
const _exit  = {};

export function getGameState()         { return _state; }

export function setGameState(next) {
  if (next === _state) return;
  _exit[_state]?.();
  _state = next;
  _enter[_state]?.();
}

export function onEnterState(state, fn) { _enter[state] = fn; }
export function onExitState(state, fn)  { _exit[state]  = fn; }
export function resetGameState()        { _state = 'title'; }
