import { getBoardMode } from '../units.js';

/** @type {Worker | null} */
let worker = null;
let nextId = 0;
/** @type {Map<number, { resolve: (action: object | null) => void, reject: (error: Error) => void }>} */
const pending = new Map();

function serializeSearchState(state) {
  return {
    board: state.board,
    boardMode: state.boardMode,
    mapProps: state.mapProps ?? null,
    shadowClones: state.shadowClones ?? [],
    blueReserve: state.blueReserve ?? [],
    redReserve: state.redReserve ?? [],
    actedUnitIds: state.actedUnitIds instanceof Set
      ? [...state.actedUnitIds]
      : (state.actedUnitIds ?? []),
  };
}

function normalizeOptions(state, teamOrOptions) {
  const options = typeof teamOrOptions === 'string' ? { team: teamOrOptions } : teamOrOptions;
  const fallbackMode = getBoardMode(`${state.board.length}x${state.board.length}`);

  return {
    team: options.team ?? 'red',
    actionsPerTurn: options.actionsPerTurn ?? fallbackMode.actionsPerTurn,
    difficulty: options.difficulty ?? 'hard',
    timeBudgetMs: options.timeBudgetMs ?? null,
  };
}

function resetWorker() {
  if (!worker) return;
  worker.terminate();
  worker = null;
}

function failPending(error) {
  for (const [, entry] of pending) {
    entry.reject(error);
  }
  pending.clear();
}

function getWorker() {
  if (!worker) {
    worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
    worker.onmessage = (event) => {
      const { id, action, error } = event.data;
      const entry = pending.get(id);
      if (!entry) return;
      pending.delete(id);
      if (error) entry.reject(new Error(error));
      else entry.resolve(action);
    };
    worker.onerror = (event) => {
      failPending(new Error(event.message || 'AI worker error'));
      resetWorker();
    };
  }
  return worker;
}

/**
 * Chooses one action for the given team in a Web Worker.
 *
 * @param {{board: Array, mapProps?: Array, blueReserve?: Array, redReserve?: Array, actedUnitIds?: Set}} state
 * @param {string|{team: string, actionsPerTurn?: number, difficulty?: 'easy'|'normal'|'hard',
 *   timeBudgetMs?: number}} teamOrOptions
 * @returns {Promise<{type: 'deploy'|'move'|'attack', unitId: string, row?: number, col?: number,
 *   targetId?: string}|null>}
 */
export function chooseAiActionAsync(state, teamOrOptions = 'red') {
  const id = ++nextId;
  const options = normalizeOptions(state, teamOrOptions);

  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    getWorker().postMessage({
      id,
      state: serializeSearchState(state),
      options,
    });
  });
}
