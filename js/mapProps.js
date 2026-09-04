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
  isMapPropsEnabled,
} from './mapPropUtils.js';

export const MAP_PROP_KINDS = ['potion', 'spikes', 'web', 'stone'];

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
};

const SPAWN_RATE = 0.03;

export function generateMapProps(size, rng = Math.random) {
  const props = createEmptyMapProps(size);
  if (!isMapPropsEnabled(size)) return props;

  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      const roll = rng();
      if (roll < SPAWN_RATE) props[r][c] = { kind: 'potion' };
      else if (roll < SPAWN_RATE * 2) props[r][c] = { kind: 'spikes' };
      else if (roll < SPAWN_RATE * 3) props[r][c] = { kind: 'web' };
      else if (roll < SPAWN_RATE * 4) props[r][c] = { kind: 'stone' };
    }
  }

  return props;
}

/**
 * Apply terrain when a unit enters a cell (move or deploy).
 * @returns {{ board: import('./units.js').Board, mapProps: import('./mapPropUtils.js').MapProp[][], events: string[], killed: object[] }}
 */
export function resolveMapPropOnEnter(board, mapProps, row, col, unitId) {
  const prop = getMapPropAt(mapProps, row, col);
  if (!prop) {
    return { board, mapProps, events: [], killed: [] };
  }

  const nextProps = cloneMapProps(mapProps);
  const events = [];
  const killed = [];

  if (prop.kind === 'potion') {
    const healed = healUnitAt(board, row, col, 2);
    nextProps[row][col] = null;
    if (healed.unit) {
      events.push(`${MAP_PROPS.potion.icon} 紅藥水 +2`);
    }
    return { board: healed.board, mapProps: nextProps, events, killed };
  }

  if (prop.kind === 'spikes') {
    const damaged = applyTrapDamage(board, row, col, 2);
    nextProps[row][col] = null;
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
    return { board: nextBoard, mapProps: nextProps, events, killed };
  }

  if (prop.kind === 'web') {
    const nextBoard = board.map((rowCells) =>
      rowCells.map((cell) => {
        if (!cell || cell.id !== unitId) return cell;
        return { ...cell, immobilized: true };
      }),
    );
    events.push(`${MAP_PROPS.web.icon} 纏網無法移動`);
    return { board: nextBoard, mapProps: nextProps, events, killed };
  }

  return { board, mapProps, events, killed };
}
