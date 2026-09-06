import { hasShadowClone } from './rules.js';
import { cloneMapProps, getMapPropAt, isObstacleCell } from './mapPropUtils.js';

export const STAGNATION_ROUND_THRESHOLD = 10;
export const STAGNATION_HINT_THRESHOLD = 6;
export const STAGNATION_SPAWN_MESSAGE = '⚠️ 僵持過久，戰場出現尖刺！';

export function createStagnationState() {
  return {
    stagnationRounds: 0,
    combatProgressThisRound: false,
    stagnationSpawnCount: 0,
    stagnationRngSeed: null,
  };
}

export function markCombatProgress(state) {
  state.combatProgressThisRound = true;
}

export function onFullRoundComplete(state) {
  if (state.combatProgressThisRound) state.stagnationRounds = 0;
  else state.stagnationRounds += 1;
  state.combatProgressThisRound = false;
  return state.stagnationRounds >= STAGNATION_ROUND_THRESHOLD;
}

export function createSeededRng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

export function stagnationRngForState(state) {
  if (state.stagnationRngSeed != null) {
    return createSeededRng(state.stagnationRngSeed + (state.stagnationSpawnCount ?? 0));
  }
  return Math.random;
}

/**
 * @param {import('./units.js').Board} board
 * @param {import('./mapPropUtils.js').MapProp[][]} mapProps
 * @param {import('./rules.js').ShadowClone[]} shadowClones
 * @param {() => number} rng
 */
export function spawnStagnationSpike(board, mapProps, shadowClones, rng) {
  const candidates = [];
  for (let r = 0; r < board.length; r++) {
    for (let c = 0; c < board[r].length; c++) {
      if (board[r][c]) continue;
      if (isObstacleCell(mapProps, r, c)) continue;
      if (getMapPropAt(mapProps, r, c)) continue;
      if (hasShadowClone(shadowClones, r, c)) continue;
      candidates.push([r, c]);
    }
  }

  if (candidates.length === 0) {
    return { mapProps, spawned: null };
  }

  const [row, col] = candidates[Math.floor(rng() * candidates.length)];
  const next = cloneMapProps(mapProps);
  next[row][col] = { kind: 'spikes' };
  return { mapProps: next, spawned: { row, col } };
}

/**
 * @param {object} state
 * @param {'blue'|'red'} endedTeam
 * @param {{ tutorial?: boolean }} [options]
 * @returns {string|null}
 */
export function applyStagnationAfterTurnBoundary(state, endedTeam, options = {}) {
  if (options.tutorial || endedTeam !== 'red' || state.phase !== 'battle') {
    return null;
  }

  const shouldSpawn = onFullRoundComplete(state);
  if (!shouldSpawn) return null;

  const rng = stagnationRngForState(state);
  const result = spawnStagnationSpike(state.board, state.mapProps, state.shadowClones, rng);
  state.stagnationRounds = 0;
  if (!result.spawned) return null;

  state.mapProps = result.mapProps;
  state.stagnationSpawnCount = (state.stagnationSpawnCount ?? 0) + 1;
  return STAGNATION_SPAWN_MESSAGE;
}
