const THUMB_ROOT = '/thumbs';

export function thumbnailUrl(category, id) {
  return `${THUMB_ROOT}/${category}/${id}.png`;
}

export function createThumbnailMap(ids, category) {
  const map = new Map();
  for (const id of ids) {
    map.set(id, thumbnailUrl(category, id));
  }
  return map;
}
