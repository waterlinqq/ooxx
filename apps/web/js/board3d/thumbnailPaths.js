import { ASSET_VERSION } from './assetVersion.js';

const THUMB_ROOT = '/thumbs';

export function thumbnailUrl(category, id) {
  return `${THUMB_ROOT}/${category}/${id}.png?v=${ASSET_VERSION}`;
}

export function createThumbnailMap(ids, category) {
  const map = new Map();
  for (const id of ids) {
    map.set(id, thumbnailUrl(category, id));
  }
  return map;
}

export function navAnimationUrl(navId, phase) {
  return `${THUMB_ROOT}/nav/${navId}-${phase}.webp?v=${ASSET_VERSION}`;
}
