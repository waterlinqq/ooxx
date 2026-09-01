import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { chooseAiAction } from '../js/ai.js';
import {
  FIXED_ROSTER,
  SLOT_ORDER,
  createUnit,
  createEmptyBoard,
  parseSlot,
  getBoardMode,
} from '../js/units.js';
import {
  applyDeploy,
  applyMove,
  applyAttack,
  checkWin,
  isTeamEliminated,
  getValidDeployCells,
  getValidMoves,
  getValidAttackTargets,
} from '../js/rules.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_GAMES = 100;
const DEFAULT_MODE = '4x4';

function parseArgs(argv) {
  const opts = { games: DEFAULT_GAMES, mode: DEFAULT_MODE, format: 'round', out: null };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--games' || arg === '-n') opts.games = Number(argv[++i]);
    else if (arg === '--mode') opts.mode = argv[++i];
    else if (arg === '--format') opts.format = argv[++i];
    else if (arg === '--out' || arg === '-o') opts.out = argv[++i];
  }
  return opts;
}

function getModeMeta(modeId) {
  return getBoardMode(modeId);
}

function createSimUnit(classId, teamId, counter, ownerSeat = null) {
  const unit = createUnit(classId, teamId, ownerSeat);
  unit.id = `${teamId}-${classId}-${counter}`;
  return unit;
}

function createSimReserve(roster, teamId, counterStart, matchFormat) {
  const half = Math.ceil(roster.length / 2);
  return roster.map((classId, index) => {
    const ownerSeat = matchFormat === '2v2' ? (index < half ? 0 : 1) : null;
    return createSimUnit(classId, teamId, counterStart + index, ownerSeat);
  });
}

function serializeAction(action, board, reserves) {
  const allUnits = [...board.flat().filter(Boolean), ...reserves.blue, ...reserves.red];
  const byId = new Map(allUnits.map((u) => [u.id, u]));

  if (action.type === 'deploy') {
    const unit = byId.get(action.unitId);
    return {
      type: 'deploy',
      classId: unit?.classId ?? null,
      row: action.row,
      col: action.col,
    };
  }

  if (action.type === 'move') {
    const unit = byId.get(action.unitId);
    return {
      type: 'move',
      classId: unit?.classId ?? null,
      from: unit ? { row: unit.row, col: unit.col } : null,
      to: { row: action.row, col: action.col },
    };
  }

  if (action.type === 'attack') {
    const unit = byId.get(action.unitId);
    const target = byId.get(action.targetId);
    return {
      type: 'attack',
      classId: unit?.classId ?? null,
      targetClassId: target?.classId ?? null,
      from: unit ? { row: unit.row, col: unit.col } : null,
      target: target ? { row: target.row, col: target.col } : null,
    };
  }

  return action;
}

function hasValidActionsForSlot(board, reserve, slot, actedUnitIds) {
  const { team, seat } = parseSlot(slot);
  const slotReserve = seat == null ? reserve : reserve.filter((u) => u.ownerSeat === seat);

  if (getValidDeployCells(board).length > 0 && slotReserve.length > 0) return true;

  for (const row of board) {
    for (const unit of row) {
      if (!unit || unit.team !== team || actedUnitIds.has(unit.id)) continue;
      if (seat != null && unit.ownerSeat !== seat) continue;
      if (getValidMoves(board, unit).length > 0) return true;
      if (getValidAttackTargets(board, unit).length > 0) return true;
    }
  }
  return false;
}

function applyAiAction(state, action, team) {
  const reserves = { blue: state.blueReserve, red: state.redReserve };

  if (action.type === 'deploy') {
    const reserve = team === 'blue' ? state.blueReserve : state.redReserve;
    const unit = reserve.find((u) => u.id === action.unitId);
    const result = applyDeploy(state.board, unit, action.row, action.col);
    state.board = result.board;
    if (team === 'blue') state.blueReserve = state.blueReserve.filter((u) => u.id !== unit.id);
    else state.redReserve = state.redReserve.filter((u) => u.id !== unit.id);
    return { label: 'deploy', detail: serializeAction(action, state.board, reserves) };
  }

  if (action.type === 'move') {
    const unit = state.board.flat().find((u) => u?.id === action.unitId);
    const result = applyMove(state.board, unit, action.row, action.col);
    state.board = result.board;
    return { label: 'move', detail: serializeAction(action, state.board, reserves) };
  }

  if (action.type === 'attack') {
    const unit = state.board.flat().find((u) => u?.id === action.unitId);
    const target = state.board.flat().find((u) => u?.id === action.targetId);
    const result = applyAttack(state.board, unit, target);
    state.board = result.board;
    return {
      label: 'attack',
      detail: serializeAction(action, state.board, reserves),
      kills: result.killed.length + (result.explosionKilled?.length ?? 0),
    };
  }

  return null;
}

function checkRoundEnd(state, actingTeam) {
  const enemy = actingTeam === 'blue' ? 'red' : 'blue';
  const enemyReserve = enemy === 'blue' ? state.blueReserve : state.redReserve;
  const winLine = checkWin(state.board, actingTeam);

  if (winLine) {
    return { winner: actingTeam, reason: 'line', winLine };
  }
  if (isTeamEliminated(state.board, enemy, enemyReserve)) {
    return { winner: actingTeam, reason: 'elimination', winLine: null };
  }
  return null;
}

function hasValidActions(board, reserve, team, actedUnitIds) {
  if (getValidDeployCells(board).length > 0 && reserve.length > 0) return true;

  for (const row of board) {
    for (const unit of row) {
      if (!unit || unit.team !== team || actedUnitIds.has(unit.id)) continue;
      if (getValidMoves(board, unit).length > 0) return true;
      if (getValidAttackTargets(board, unit).length > 0) return true;
    }
  }
  return false;
}

function advanceSlot(currentSlot, slotOrder) {
  const idx = slotOrder.indexOf(currentSlot);
  return slotOrder[(idx + 1) % slotOrder.length];
}

function findNextActiveSlot(state, slotOrder) {
  const reserveByTeam = {
    blue: state.blueReserve,
    red: state.redReserve,
  };

  let slot = state.currentSlot;
  for (let i = 0; i < slotOrder.length; i++) {
    slot = advanceSlot(slot, slotOrder);
    const { team } = parseSlot(slot);
    if (hasValidActionsForSlot(state.board, reserveByTeam[team], slot, state.actedUnitIds)) {
      return slot;
    }
  }
  return advanceSlot(state.currentSlot, slotOrder);
}

function runRound({ mode, round, firstPlayer, firstSlot, unitCounterStart }) {
  const size = mode.size;
  const matchFormat = mode.matchFormat;
  const actionsPerTurn = mode.actionsPerTurn;
  let unitCounter = unitCounterStart;
  const board = createEmptyBoard(size);
  const state = {
    board,
    blueReserve: createSimReserve(FIXED_ROSTER, 'blue', unitCounter, matchFormat),
    redReserve: createSimReserve(FIXED_ROSTER, 'red', unitCounter + FIXED_ROSTER.length, matchFormat),
    currentPlayer: firstPlayer,
    currentSlot: firstSlot ?? `${firstPlayer}-0`,
    actionsRemaining: actionsPerTurn,
    actedUnitIds: new Set(),
  };
  unitCounter += FIXED_ROSTER.length * 2;

  const moves = [];
  let turn = 1;
  const maxTurns = 800;
  const slotOrder = [...SLOT_ORDER];

  while (turn <= maxTurns) {
    if (matchFormat === '2v2') {
      const { team, seat } = parseSlot(state.currentSlot);
      state.currentPlayer = team;
      const reserve = team === 'blue' ? state.blueReserve : state.redReserve;

      if (!hasValidActionsForSlot(state.board, reserve, state.currentSlot, state.actedUnitIds)) {
        state.currentSlot = findNextActiveSlot(state, slotOrder);
        state.actionsRemaining = actionsPerTurn;
        state.actedUnitIds = new Set();
        turn++;
        continue;
      }

      const action = chooseAiAction(
        {
          board: state.board,
          blueReserve: state.blueReserve,
          redReserve: state.redReserve,
          actedUnitIds: state.actedUnitIds,
        },
        { team, ownerSeat: seat },
      );

      if (!action) {
        state.currentSlot = findNextActiveSlot(state, slotOrder);
        state.actionsRemaining = actionsPerTurn;
        state.actedUnitIds = new Set();
        turn++;
        continue;
      }

      const applied = applyAiAction(state, action, team);
      state.actedUnitIds.add(action.unitId);
      state.actionsRemaining--;

      const end = checkRoundEnd(state, team);
      moves.push({
        turn,
        team,
        slot: state.currentSlot,
        actionRemainingAfter: state.actionsRemaining,
        ...applied,
      });

      if (end) {
        return {
          round,
          firstPlayer,
          firstSlot: firstSlot ?? 'blue-0',
          winner: end.winner,
          reason: end.reason,
          winLine: end.winLine,
          totalTurns: turn,
          totalMoves: moves.length,
          moves,
          unitCounterEnd: unitCounter,
        };
      }

      state.currentSlot = findNextActiveSlot(state, slotOrder);
      state.actionsRemaining = actionsPerTurn;
      state.actedUnitIds = new Set();
      turn++;
      continue;
    }

    const team = state.currentPlayer;
    const reserve = team === 'blue' ? state.blueReserve : state.redReserve;

    if (!hasValidActions(state.board, reserve, team, state.actedUnitIds)) {
      state.currentPlayer = team === 'blue' ? 'red' : 'blue';
      state.actionsRemaining = actionsPerTurn;
      state.actedUnitIds = new Set();
      turn++;
      continue;
    }

    const action = chooseAiAction(
      {
        board: state.board,
        blueReserve: state.blueReserve,
        redReserve: state.redReserve,
        actedUnitIds: state.actedUnitIds,
      },
      team,
    );

    if (!action) {
      state.currentPlayer = team === 'blue' ? 'red' : 'blue';
      state.actionsRemaining = actionsPerTurn;
      state.actedUnitIds = new Set();
      turn++;
      continue;
    }

    const applied = applyAiAction(state, action, team);
    state.actedUnitIds.add(action.unitId);
    state.actionsRemaining--;

    const end = checkRoundEnd(state, team);
    moves.push({
      turn,
      team,
      actionRemainingAfter: state.actionsRemaining,
      ...applied,
    });

    if (end) {
      return {
        round,
        firstPlayer,
        winner: end.winner,
        reason: end.reason,
        winLine: end.winLine,
        totalTurns: turn,
        totalMoves: moves.length,
        moves,
        unitCounterEnd: unitCounter,
      };
    }

    if (state.actionsRemaining <= 0) {
      state.currentPlayer = team === 'blue' ? 'red' : 'blue';
      state.actionsRemaining = actionsPerTurn;
      state.actedUnitIds = new Set();
      turn++;
    } else if (!hasValidActions(state.board, reserve, team, state.actedUnitIds)) {
      state.currentPlayer = team === 'blue' ? 'red' : 'blue';
      state.actionsRemaining = actionsPerTurn;
      state.actedUnitIds = new Set();
      turn++;
    }
  }

  return {
    round,
    firstPlayer,
    firstSlot: firstSlot ?? `${firstPlayer}-0`,
    winner: null,
    reason: 'turn_limit',
    winLine: null,
    totalTurns: maxTurns,
    totalMoves: moves.length,
    moves,
    unitCounterEnd: unitCounter,
  };
}

function getRoundFirstPlayer(round, lastWinner) {
  if (round === 1) return 'blue';
  if (round === 2) return 'red';
  return lastWinner === 'blue' ? 'red' : 'blue';
}

function runSeries(gameId, mode) {
  let blueScore = 0;
  let redScore = 0;
  let round = 1;
  let lastWinner = null;
  let unitCounter = 0;
  const rounds = [];

  while (blueScore < 2 && redScore < 2) {
    const firstPlayer = getRoundFirstPlayer(round, lastWinner);
    const result = runRound({
      mode,
      round,
      firstPlayer,
      firstSlot: `${firstPlayer}-0`,
      unitCounterStart: unitCounter,
    });
    unitCounter = result.unitCounterEnd;
    rounds.push(result);

    if (result.winner === 'blue') blueScore++;
    else if (result.winner === 'red') redScore++;

    lastWinner = result.winner;
    round++;
  }

  return {
    gameId,
    boardMode: mode.id,
    boardSize: mode.size,
    blueScore,
    redScore,
    seriesWinner: blueScore >= 2 ? 'blue' : 'red',
    roundsPlayed: rounds.length,
    rounds,
  };
}

function summarize(games, format) {
  if (format === 'series') {
    const seriesWins = { blue: 0, red: 0 };
    const roundWins = { blue: 0, red: 0 };
    const reasons = { line: 0, elimination: 0, turn_limit: 0 };
    let totalMoves = 0;
    let totalRounds = 0;

    for (const game of games) {
      seriesWins[game.seriesWinner]++;
      for (const round of game.rounds) {
        totalRounds++;
        if (round.winner) roundWins[round.winner]++;
        reasons[round.reason] = (reasons[round.reason] ?? 0) + 1;
        totalMoves += round.totalMoves;
      }
    }

    return {
      games: games.length,
      seriesWins,
      roundWins,
      roundEndReasons: reasons,
      avgMovesPerRound: totalRounds ? Math.round((totalMoves / totalRounds) * 10) / 10 : 0,
      avgRoundsPerSeries: games.length ? Math.round((totalRounds / games.length) * 100) / 100 : 0,
    };
  }

  const wins = { blue: 0, red: 0 };
  const firstPlayerWins = { blue: 0, red: 0 };
  const reasons = { line: 0, elimination: 0, turn_limit: 0 };
  let totalMoves = 0;

  for (const game of games) {
    const round = game.rounds[0];
    if (round.winner) wins[round.winner]++;
    if (round.winner === round.firstPlayer) firstPlayerWins[round.firstPlayer]++;
    reasons[round.reason] = (reasons[round.reason] ?? 0) + 1;
    totalMoves += round.totalMoves;
  }

  return {
    games: games.length,
    wins,
    firstPlayerWins,
    roundEndReasons: reasons,
    avgMovesPerRound: games.length ? Math.round((totalMoves / games.length) * 10) / 10 : 0,
  };
}

function runStandaloneRound(gameId, mode, firstPlayer, unitCounterStart) {
  const firstSlot = mode.matchFormat === '2v2' ? 'blue-0' : `${firstPlayer}-0`;
  const result = runRound({
    mode,
    round: 1,
    firstPlayer: mode.matchFormat === '2v2' ? 'blue' : firstPlayer,
    firstSlot,
    unitCounterStart,
  });
  return {
    gameId,
    boardMode: mode.id,
    boardSize: mode.size,
    firstPlayer: mode.matchFormat === '2v2' ? 'blue-0' : firstPlayer,
    winner: result.winner,
    reason: result.reason,
    winLine: result.winLine,
    totalTurns: result.totalTurns,
    totalMoves: result.totalMoves,
    moves: result.moves,
    unitCounterEnd: result.unitCounterEnd,
  };
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  const mode = getModeMeta(opts.mode);
  const size = mode.size;
  const format = opts.format;
  const formatLabel = format === 'series' ? '系列賽' : '單局';
  const outPath = opts.out ?? path.join(
    __dirname,
    '..',
    'data',
    `${opts.mode}-ai-vs-ai-${opts.games}${format === 'series' ? '-series' : ''}.json`,
  );

  console.log(`開始模擬：${opts.games} 場${formatLabel} · ${opts.mode} · AI vs AI${mode.matchFormat === '2v2' ? ' (2v2)' : ''}`);
  const started = Date.now();
  const games = [];
  let unitCounter = 0;

  for (let i = 0; i < opts.games; i++) {
    if (format === 'series') {
      games.push(runSeries(i + 1, mode));
    } else {
      const firstPlayer = i % 2 === 0 ? 'blue' : 'red';
      const round = runStandaloneRound(i + 1, mode, firstPlayer, unitCounter);
      unitCounter = round.unitCounterEnd;
      games.push({
        gameId: round.gameId,
        boardMode: round.boardMode,
        boardSize: round.boardSize,
        rounds: [round],
      });
    }

    if ((i + 1) % 10 === 0 || i + 1 === opts.games) {
      process.stdout.write(`\r進度：${i + 1}/${opts.games}`);
    }
  }
  process.stdout.write('\n');

  const payload = {
    generatedAt: new Date().toISOString(),
    config: {
      games: opts.games,
      boardMode: opts.mode,
      boardSize: size,
      matchFormat: mode.matchFormat,
      players: mode.matchFormat === '2v2'
        ? { 'blue-0': 'ai', 'blue-1': 'ai', 'red-0': 'ai', 'red-1': 'ai' }
        : { blue: 'ai', red: 'ai' },
      format,
      seriesFormat: mode.seriesFormat,
      firstPlayerAlternation: format === 'round' && mode.matchFormat !== '2v2',
    },
    summary: summarize(games, format),
    games,
  };

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(payload, null, 2));

  const elapsed = ((Date.now() - started) / 1000).toFixed(1);
  console.log(`完成：${outPath}`);
  console.log(`耗時 ${elapsed}s`);

  if (format === 'series') {
    console.log(`系列賽勝率 藍 ${payload.summary.seriesWins.blue} : 紅 ${payload.summary.seriesWins.red}`);
    console.log(`平均每局 ${payload.summary.avgMovesPerRound} 步 · 平均 ${payload.summary.avgRoundsPerSeries} 局/系列賽`);
  } else {
    console.log(`單局勝率 藍 ${payload.summary.wins.blue} : 紅 ${payload.summary.wins.red}`);
    console.log(`先攻勝率 藍 ${payload.summary.firstPlayerWins.blue} : 紅 ${payload.summary.firstPlayerWins.red}`);
    console.log(`平均每局 ${payload.summary.avgMovesPerRound} 步`);
  }
}

main();
