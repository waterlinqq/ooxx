/** @typedef {'potion'|'spikes'|'web'|'stone'|'flag'} MapPropKind */

/** @typedef {{ kind: MapPropKind }} MapProp */

export function createEmptyMapProps(size) {
  return Array.from({ length: size }, () => Array(size).fill(null));
}

export function cloneMapProps(mapProps) {
  return mapProps.map((row) => row.map((cell) => (cell ? { ...cell } : null)));
}

export function getMapPropAt(mapProps, row, col) {
  if (!mapProps) return null;
  return mapProps[row]?.[col] ?? null;
}

export function isStoneCell(mapProps, row, col) {
  return getMapPropAt(mapProps, row, col)?.kind === 'stone';
}

export function isFlagCell(mapProps, row, col) {
  return getMapPropAt(mapProps, row, col)?.kind === 'flag';
}

export function isObstacleCell(mapProps, row, col) {
  const kind = getMapPropAt(mapProps, row, col)?.kind;
  return kind === 'stone' || kind === 'flag';
}

export function isMapPropsEnabled(size) {
  return size >= 4;
}
