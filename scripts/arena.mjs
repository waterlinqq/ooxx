// Head-to-head bench for two AI builds. Colours are swapped every other game so the
// first-move advantage cancels out and the win rate reflects engine strength only.
import { getBoardMode, createRandomRoster } from '../apps/web/js/units.js';
import { runMatch, createRng } from './lib/match.mjs';

const DEFAULT_MODES = ['3x3', '4x4', '5x5'];

function parseArgs(argv) {
  const opts = {
    games: 40,
    modes: null,
    seed: 20260902,
    a: '../apps/web/js/ai.js',
    b: '../apps/web/js/ai-legacy.js',
    aName: null,
    bName: null,
    difficulty: 'hard',
    difficultyA: null,
    difficultyB: null,
    // 'preset' uses the mode's fixed roster; 'random' draws a fresh lineup per game the
    // way the formation screen does, which is the only way the newer classes get played.
    roster: 'preset',
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--games' || arg === '-n') opts.games = Number(argv[++i]);
    else if (arg === '--mode') {
      const value = argv[++i];
      opts.modes = value === 'all' ? [...DEFAULT_MODES] : [value];
    }
    else if (arg === '--seed') opts.seed = Number(argv[++i]);
    else if (arg === '--a') opts.a = argv[++i];
    else if (arg === '--b') opts.b = argv[++i];
    else if (arg === '--difficulty') opts.difficulty = argv[++i];
    else if (arg === '--difficulty-a') opts.difficultyA = argv[++i];
    else if (arg === '--difficulty-b') opts.difficultyB = argv[++i];
    else if (arg === '--roster') opts.roster = argv[++i];
  }
  opts.modes ??= DEFAULT_MODES;
  opts.difficultyA ??= opts.difficulty;
  opts.difficultyB ??= opts.difficulty;
  // Labels have to distinguish the sides even when both are the same module, which is
  // how difficulty presets get benchmarked against each other.
  opts.aName ??= `${opts.a.replace(/^.*\//, '')}[${opts.difficultyA}]`;
  opts.bName ??= `${opts.b.replace(/^.*\//, '')}[${opts.difficultyB}]`;
  return opts;
}

async function loadEngine(spec, name, difficulty, rng) {
  const mod = await import(spec.startsWith('.') ? spec : `../${spec}`);
  if (typeof mod.chooseAiAction !== 'function') {
    throw new Error(`${spec} does not export chooseAiAction`);
  }
  return {
    name,
    choose: mod.chooseAiAction,
    // Legacy builds ignore unknown options, so passing these unconditionally is safe.
    options: { difficulty, rng },
  };
}

function buildAgents(engineForBlue, engineForRed) {
  return { blue: engineForBlue, red: engineForRed };
}

function emptyTally(name) {
  return {
    name,
    wins: 0,
    losses: 0,
    draws: 0,
    decisions: 0,
    timeMs: 0,
    maxTimeMs: 0,
    placements: 0,
    exposedPlacements: 0,
    kills: 0,
    selfLosses: 0,
  };
}

function absorb(tally, stats) {
  tally.decisions += stats.decisions;
  tally.timeMs += stats.timeMs;
  tally.maxTimeMs = Math.max(tally.maxTimeMs, stats.maxTimeMs);
  tally.placements += stats.placements;
  tally.exposedPlacements += stats.exposedPlacements;
  tally.kills += stats.kills;
  tally.selfLosses += stats.selfLosses;
}

function pct(part, whole) {
  if (!whole) return '0.0%';
  return `${((part / whole) * 100).toFixed(1)}%`;
}

function report(modeId, tallies, games, reasons, uniqueScripts, totalMoves) {
  const [a, b] = tallies;
  console.log(`\n=== ${modeId} · ${games} 場`);
  console.log(`  ${a.name}: ${a.wins} 勝 / ${a.losses} 敗 · 勝率 ${pct(a.wins, games)}`);
  console.log(`  ${b.name}: ${b.wins} 勝 / ${b.losses} 敗 · 勝率 ${pct(b.wins, games)}`);
  if (a.draws) console.log(`  未分勝負：${a.draws}`);
  console.log(`  結束原因：${JSON.stringify(reasons)}`);
  console.log(`  相異棋局：${uniqueScripts}/${games} · 平均步數 ${(totalMoves / games).toFixed(1)}`);
  for (const t of tallies) {
    console.log(
      `  ${t.name} 決策 ${t.decisions} 次 · 平均 ${(t.timeMs / Math.max(1, t.decisions)).toFixed(1)}ms`
      + ` · 最長 ${t.maxTimeMs.toFixed(0)}ms`
      + ` · 落子即可被殺 ${t.exposedPlacements}/${t.placements} (${pct(t.exposedPlacements, t.placements)})`
      + ` · 擊殺 ${t.kills} · 自損 ${t.selfLosses}`,
    );
  }
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  console.log(`Arena: ${opts.aName} vs ${opts.bName} · seed ${opts.seed} · 編組 ${opts.roster}`);

  for (const modeId of opts.modes) {
    const mode = getBoardMode(modeId);
    // Separate streams keep each engine's tie-breaking independent of the other's.
    const engineA = await loadEngine(opts.a, opts.aName, opts.difficultyA, createRng(opts.seed));
    const engineB = await loadEngine(opts.b, opts.bName, opts.difficultyB, createRng(opts.seed + 977));

    const tallies = [emptyTally(engineA.name), emptyTally(engineB.name)];
    const reasons = {};
    const scripts = new Set();
    const rosterRng = createRng(opts.seed + 31);
    let unitCounter = 0;
    let totalMoves = 0;

    for (let i = 0; i < opts.games; i++) {
      const aIsBlue = i % 2 === 0;
      const firstPlayer = i % 2 === 0 ? 'blue' : 'red';
      const roster = opts.roster === 'random' ? createRandomRoster(modeId, rosterRng) : null;
      const result = runMatch({
        mode,
        firstPlayer,
        unitCounterStart: unitCounter,
        rosters: roster ? { blue: roster, red: roster } : null,
        agents: buildAgents(aIsBlue ? engineA : engineB, aIsBlue ? engineB : engineA),
      });
      unitCounter = result.unitCounterEnd;
      totalMoves += result.totalMoves;

      const aTeam = aIsBlue ? 'blue' : 'red';
      const bTeam = aIsBlue ? 'red' : 'blue';
      absorb(tallies[0], result.stats[aTeam]);
      absorb(tallies[1], result.stats[bTeam]);

      if (result.winner === aTeam) { tallies[0].wins++; tallies[1].losses++; }
      else if (result.winner === bTeam) { tallies[1].wins++; tallies[0].losses++; }
      else { tallies[0].draws++; tallies[1].draws++; }

      reasons[result.reason] = (reasons[result.reason] ?? 0) + 1;
      scripts.add(result.moves.map((m) => JSON.stringify(m.detail)).join(';'));
      process.stdout.write(`\r${modeId} 進度 ${i + 1}/${opts.games}`);
    }
    process.stdout.write('\r');

    report(modeId, tallies, opts.games, reasons, scripts.size, totalMoves);
  }
}

main();
