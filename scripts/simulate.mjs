import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { chooseAiAction } from '../js/ai.js';
import { getBoardMode } from '../js/units.js';
import { runMatch, createRng } from './lib/match.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_GAMES = 100;
const DEFAULT_MODE = '4x4';
const DEFAULT_SEED = 20260902;

function parseArgs(argv) {
  const opts = {
    games: DEFAULT_GAMES,
    mode: DEFAULT_MODE,
    out: null,
    seed: DEFAULT_SEED,
    difficulty: 'hard',
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--games' || arg === '-n') opts.games = Number(argv[++i]);
    else if (arg === '--mode') opts.mode = argv[++i];
    else if (arg === '--out' || arg === '-o') opts.out = argv[++i];
    else if (arg === '--seed') opts.seed = Number(argv[++i]);
    else if (arg === '--difficulty') opts.difficulty = argv[++i];
  }
  return opts;
}

function summarize(games) {
  const wins = { blue: 0, red: 0 };
  const firstPlayerWins = { blue: 0, red: 0 };
  const reasons = { line: 0, elimination: 0, turn_limit: 0 };
  const scripts = new Set();
  let totalMoves = 0;

  for (const game of games) {
    const round = game.rounds[0];
    if (round.winner) wins[round.winner]++;
    if (round.winner === round.firstPlayer) firstPlayerWins[round.firstPlayer]++;
    reasons[round.reason] = (reasons[round.reason] ?? 0) + 1;
    totalMoves += round.totalMoves;
    scripts.add(`${round.firstPlayer}|${round.moves.map((m) => JSON.stringify(m.detail)).join(';')}`);
  }

  return {
    games: games.length,
    wins,
    firstPlayerWins,
    roundEndReasons: reasons,
    uniqueScripts: scripts.size,
    avgMovesPerRound: games.length ? Math.round((totalMoves / games.length) * 10) / 10 : 0,
  };
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  const mode = getBoardMode(opts.mode);
  const outPath = opts.out ?? path.join(
    __dirname,
    '..',
    'data',
    `${opts.mode}-ai-vs-ai-${opts.games}.json`,
  );

  const label = mode.matchFormat === '2v2' ? ' (2v2)' : '';
  console.log(`開始模擬：${opts.games} 場單局 · ${opts.mode} · AI vs AI${label} · seed ${opts.seed}`);
  const started = Date.now();

  const rng = createRng(opts.seed);
  const agent = { choose: chooseAiAction, options: { difficulty: opts.difficulty, rng } };
  const is2v2 = mode.matchFormat === '2v2';
  const agents = is2v2
    ? { 'blue-0': agent, 'blue-1': agent, 'red-0': agent, 'red-1': agent }
    : { blue: agent, red: agent };

  const games = [];
  let unitCounter = 0;

  for (let i = 0; i < opts.games; i++) {
    const firstPlayer = is2v2 ? 'blue' : (i % 2 === 0 ? 'blue' : 'red');
    const round = runMatch({
      mode,
      round: 1,
      firstPlayer,
      firstSlot: is2v2 ? 'blue-0' : `${firstPlayer}-0`,
      unitCounterStart: unitCounter,
      agents,
    });
    unitCounter = round.unitCounterEnd;

    games.push({
      gameId: i + 1,
      boardMode: mode.id,
      boardSize: mode.size,
      rounds: [{
        round: 1,
        // Team, not slot: in 2v2 the blue team opens through seat blue-0, and the
        // first-player tally compares this against the winning team.
        firstPlayer: round.firstPlayer,
        firstSlot: round.firstSlot,
        winner: round.winner,
        reason: round.reason,
        winLine: round.winLine,
        totalTurns: round.totalTurns,
        totalMoves: round.totalMoves,
        moves: round.moves,
      }],
    });

    if ((i + 1) % 10 === 0 || i + 1 === opts.games) {
      process.stdout.write(`\r進度：${i + 1}/${opts.games}`);
    }
  }
  process.stdout.write('\n');

  const summary = summarize(games);
  const payload = {
    generatedAt: new Date().toISOString(),
    config: {
      games: opts.games,
      boardMode: opts.mode,
      boardSize: mode.size,
      matchFormat: mode.matchFormat,
      actionsPerTurn: mode.actionsPerTurn,
      seed: opts.seed,
      difficulty: opts.difficulty,
      players: is2v2
        ? { 'blue-0': 'ai', 'blue-1': 'ai', 'red-0': 'ai', 'red-1': 'ai' }
        : { blue: 'ai', red: 'ai' },
      firstPlayerAlternation: !is2v2,
    },
    summary,
    games,
  };

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(payload, null, 2));

  const elapsed = ((Date.now() - started) / 1000).toFixed(1);
  console.log(`完成：${outPath}`);
  console.log(`耗時 ${elapsed}s`);
  console.log(`單局勝率 藍 ${summary.wins.blue} : 紅 ${summary.wins.red}`);
  console.log(`先攻勝率 藍 ${summary.firstPlayerWins.blue} : 紅 ${summary.firstPlayerWins.red}`);
  console.log(`相異棋局 ${summary.uniqueScripts}/${summary.games} · 平均每局 ${summary.avgMovesPerRound} 步`);
}

main();
