import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createEmptyBoard } from './units.js';
import { createEmptyMapProps } from './mapPropUtils.js';
import {
  STAGNATION_ROUND_THRESHOLD,
  createStagnationState,
  markCombatProgress,
  onFullRoundComplete,
  spawnStagnationSpike,
  createSeededRng,
} from './stagnation.js';

describe('stagnation', () => {
  it('counts stagnant full rounds and resets on combat progress', () => {
    const state = createStagnationState();

    for (let i = 1; i < STAGNATION_ROUND_THRESHOLD; i++) {
      assert.equal(onFullRoundComplete(state), false);
      assert.equal(state.stagnationRounds, i);
    }

    markCombatProgress(state);
    onFullRoundComplete(state);
    assert.equal(state.stagnationRounds, 0);
    assert.equal(state.combatProgressThisRound, false);
  });

  it('triggers after threshold stagnant rounds', () => {
    const state = createStagnationState();

    for (let i = 0; i < STAGNATION_ROUND_THRESHOLD - 1; i++) {
      assert.equal(onFullRoundComplete(state), false);
    }

    assert.equal(onFullRoundComplete(state), true);
    assert.equal(state.stagnationRounds, STAGNATION_ROUND_THRESHOLD);
  });

  it('spawns a spike on one empty cell', () => {
    const board = createEmptyBoard(3);
    const mapProps = createEmptyMapProps(3);
    const result = spawnStagnationSpike(board, mapProps, [], () => 0);

    assert.ok(result.spawned);
    assert.equal(result.mapProps[result.spawned.row][result.spawned.col]?.kind, 'spikes');
  });

  it('skips obstacle and occupied cells', () => {
    const board = createEmptyBoard(2);
    board[0][0] = { id: 'u1' };
    const mapProps = createEmptyMapProps(2);
    mapProps[0][1] = { kind: 'stone' };
    mapProps[1][0] = { kind: 'flag' };
    const result = spawnStagnationSpike(board, mapProps, [], () => 0);

    assert.deepEqual(result.spawned, { row: 1, col: 1 });
    assert.equal(result.mapProps[1][1]?.kind, 'spikes');
  });

  it('returns null when no candidate cells exist', () => {
    const board = createEmptyBoard(1);
    board[0][0] = { id: 'u1' };
    const mapProps = createEmptyMapProps(1);
    const result = spawnStagnationSpike(board, mapProps, [], Math.random);

    assert.equal(result.spawned, null);
  });

  it('uses seeded rng deterministically', () => {
    const board = createEmptyBoard(4);
    const mapProps = createEmptyMapProps(4);
    const rngA = createSeededRng(42);
    const rngB = createSeededRng(42);
    const a = spawnStagnationSpike(board, mapProps, [], rngA);
    const b = spawnStagnationSpike(board, mapProps, [], rngB);

    assert.deepEqual(a.spawned, b.spawned);
  });
});
