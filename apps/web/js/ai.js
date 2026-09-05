import { getBoardMode } from './units.js';
import { searchBestAction } from './ai/search.js';

export { WIN_SCORE } from './ai/evaluate.js';

/**
 * Chooses one action for the given team.
 *
 * Pass a team name for the simple case, or an options object to override the search
 * budget or inject an RNG for tie-breaking.
 *
 * @param {{board: Array, mapProps?: Array, blueReserve?: Array, redReserve?: Array, actedUnitIds?: Set}} state
 * @param {string|{team: string, actionsPerTurn?: number, roster?: string[],
 *   difficulty?: 'easy'|'normal'|'hard', rng?: () => number, timeBudgetMs?: number}} teamOrOptions
 * @returns {{type: 'deploy'|'move'|'attack', unitId: string, row?: number, col?: number,
 *   targetId?: string}|null}
 */
export function chooseAiAction(state, teamOrOptions = 'red') {
  const options = typeof teamOrOptions === 'string' ? { team: teamOrOptions } : teamOrOptions;
  const fallbackMode = getBoardMode(`${state.board.length}x${state.board.length}`);

  return searchBestAction(
    {
      board: state.board,
      mapProps: state.mapProps ?? null,
      shadowClones: state.shadowClones ?? [],
      blueReserve: state.blueReserve ?? [],
      redReserve: state.redReserve ?? [],
      actedUnitIds: state.actedUnitIds ?? new Set(),
    },
    {
      team: options.team ?? 'red',
      actionsPerTurn: options.actionsPerTurn ?? fallbackMode.actionsPerTurn,
      difficulty: options.difficulty ?? 'hard',
      rng: options.rng ?? null,
      timeBudgetMs: options.timeBudgetMs ?? null,
    },
  );
}
