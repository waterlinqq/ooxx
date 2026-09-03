// Throwaway: does 4x4 stay playable at 1 action per turn, and at which roster size?
import { chooseAiAction } from '../js/ai.js';
import { BOARD_MODES } from '../js/units.js';
import { runMatch, createRng } from '../scripts/lib/match.mjs';

const GAMES = Number(process.env.GAMES ?? 12);
const SEED = 20260902;
const FULL = BOARD_MODES['4x4'].roster;

const variants = [];
for (const actionsPerTurn of [2, 1]) {
  for (const rosterSize of [10, 8, 7, 6]) {
    if (actionsPerTurn === 2 && rosterSize !== 10) continue;
    variants.push({ actionsPerTurn, rosterSize });
  }
}

for (const v of variants) {
  const roster = FULL.slice(0, v.rosterSize);
  const mode = { ...BOARD_MODES['4x4'], actionsPerTurn: v.actionsPerTurn, roster };
  const rng = createRng(SEED);
  const agent = { choose: chooseAiAction, options: { difficulty: 'hard', rng } };
  const reasons = { line: 0, elimination: 0, turn_limit: 0 };
  let moves = 0;
  let unitCounter = 0;
  const started = Date.now();

  for (let i = 0; i < GAMES; i++) {
    const firstPlayer = i % 2 === 0 ? 'blue' : 'red';
    const round = runMatch({
      mode,
      firstPlayer,
      firstSlot: `${firstPlayer}-0`,
      unitCounterStart: unitCounter,
      agents: { blue: agent, red: agent },
      recordMoves: false,
    });
    unitCounter = round.unitCounterEnd;
    reasons[round.reason]++;
    moves += round.totalMoves;
  }

  const secs = ((Date.now() - started) / 1000).toFixed(1);
  console.log(
    `apt=${v.actionsPerTurn} roster=${v.rosterSize}  連線 ${reasons.line} / 全滅 ${reasons.elimination} / 逾時 ${reasons.turn_limit}`
    + `  平均 ${(moves / GAMES).toFixed(1)} 步  耗時 ${secs}s`,
  );
}
