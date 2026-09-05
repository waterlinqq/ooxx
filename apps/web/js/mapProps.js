import { healUnitAt, applyTrapDamage, resolveDeathExplosions } from './rules.js';
import {
  createEmptyMapProps,
  cloneMapProps,
  getMapPropAt,
  isMapPropsEnabled,
} from './mapPropUtils.js';

export {
  createEmptyMapProps,
  cloneMapProps,
  getMapPropAt,
  isStoneCell,
  isFlagCell,
  isObstacleCell,
  isMapPropsEnabled,
} from './mapPropUtils.js';

export const MAP_PROP_KINDS = ['potion', 'spikes', 'web', 'stone', 'flag'];

export const MAP_PROPS = {
  potion: {
    kind: 'potion',
    name: '紅藥水',
    icon: '🧪',
    desc: '進入時恢復 2 點生命',
  },
  spikes: {
    kind: 'spikes',
    name: '尖刺',
    icon: '🔺',
    desc: '初次進入時受到 2 點傷害',
  },
  web: {
    kind: 'web',
    name: '蜘蛛網',
    icon: '🕸️',
    desc: '進入後本局無法移動',
  },
  stone: {
    kind: 'stone',
    name: '石頭',
    icon: '🪨',
    desc: '佔格，無法部署或走入',
  },
  flag: {
    kind: 'flag',
    name: '紅藍旗',
    icon: '🚩',
    desc: '佔格且無法進入，可同時作為雙方連線',
  },
};

const SPAWN_RATE = 0.02;

export function generateMapProps(size, rng = Math.random, excludedCells = []) {
  const props = createEmptyMapProps(size);
  if (!isMapPropsEnabled(size)) return props;

  const excluded = new Set(excludedCells.map(([r, c]) => `${r},${c}`));

  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (excluded.has(`${r},${c}`)) continue;
      const roll = rng();
      if (roll < SPAWN_RATE) props[r][c] = { kind: 'potion' };
      else if (roll < SPAWN_RATE * 2) props[r][c] = { kind: 'spikes' };
      else if (roll < SPAWN_RATE * 3) props[r][c] = { kind: 'web' };
      else if (roll < SPAWN_RATE * 4) props[r][c] = { kind: 'stone' };
      else if (roll < SPAWN_RATE * 5) props[r][c] = { kind: 'flag' };
    }
  }

  return props;
}

/**
 * Apply terrain when a unit enters a cell (move or deploy).
 * `trigger` describes what the prop did, for the 3D layer to animate.
 * @returns {{ board: import('./units.js').Board, mapProps: import('./mapPropUtils.js').MapProp[][], events: string[], killed: object[], trigger: object|null }}
 */
export function resolveMapPropOnEnter(board, mapProps, row, col, unitId) {
  const prop = getMapPropAt(mapProps, row, col);
  if (!prop) {
    return { board, mapProps, events: [], killed: [], trigger: null };
  }

  const nextProps = cloneMapProps(mapProps);
  const events = [];
  const killed = [];
  const trigger = { kind: prop.kind, row, col, unitId };

  if (prop.kind === 'potion') {
    const before = board[row][col]?.hp ?? 0;
    const healed = healUnitAt(board, row, col, 2);
    nextProps[row][col] = null;
    trigger.heal = healed.unit ? healed.unit.hp - before : 0;
    if (healed.unit) {
      events.push(`${MAP_PROPS.potion.icon} 紅藥水 +2`);
    }
    return { board: healed.board, mapProps: nextProps, events, killed, trigger };
  }

  if (prop.kind === 'spikes') {
    const damaged = applyTrapDamage(board, row, col, 2);
    nextProps[row][col] = null;
    trigger.damage = damaged.hit ? 2 : 0;
    trigger.killed = Boolean(damaged.killed);
    if (damaged.hit) {
      events.push(`${MAP_PROPS.spikes.icon} 尖刺 -2`);
    }
    let nextBoard = damaged.board;
    if (damaged.killed) {
      killed.push(damaged.killed);
      const explosion = resolveDeathExplosions(nextBoard, [damaged.killed]);
      nextBoard = explosion.board;
      if (explosion.explosions?.length > 0) {
        for (const blast of explosion.explosions) {
          for (const target of blast.targets) {
            if (target.hp <= 0) killed.push({ ...target });
          }
        }
      }
    }
    return { board: nextBoard, mapProps: nextProps, events, killed, trigger };
  }

  if (prop.kind === 'web') {
    const nextBoard = board.map((rowCells) =>
      rowCells.map((cell) => {
        if (!cell || cell.id !== unitId) return cell;
        return { ...cell, immobilized: true };
      }),
    );
    events.push(`${MAP_PROPS.web.icon} 纏網無法移動`);
    return { board: nextBoard, mapProps: nextProps, events, killed, trigger };
  }

  return { board, mapProps, events, killed, trigger: null };
}
