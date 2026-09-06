import { CLASS_IDS } from '@ooxx/shared/units.js';
import { ITEM_IDS } from '../js/items.js';
import { MAP_PROP_KINDS } from '../js/mapProps.js';
import { NAV_ICON_IDS } from '../js/board3d/NavIconModels.js';
import { SIDE_ICON_IDS } from '../js/board3d/SideIconModels.js';
import {
  setupBakeScene,
  setupBakeCamera,
  createBakeRenderer,
  disposeBakeResources,
} from '../js/board3d/ThumbnailBake.js';
import { bakeUnitThumbnail, UNIT_THUMB_SIZE } from '../js/board3d/UnitThumbnails.js';
import { bakeItemThumbnail, bakeMapPropThumbnail, ITEM_THUMB_SIZE } from '../js/board3d/ItemThumbnails.js';
import { bakeNavThumbnail, NAV_THUMB_SIZE } from '../js/board3d/NavThumbnails.js';
import { bakeSideThumbnail, SIDE_THUMB_SIZE } from '../js/board3d/SideIconThumbnails.js';

async function bakeCategory({ ids, size, lookAtY, bakeOne }) {
  const renderer = createBakeRenderer(size, size);
  const { scene, envMap, pmrem } = setupBakeScene(renderer);
  const camera = setupBakeCamera(lookAtY);
  const out = {};

  for (const id of ids) {
    const ok = bakeOne(renderer, scene, camera, id);
    if (!ok) continue;
    out[id] = renderer.domElement.toDataURL('image/png');
  }

  disposeBakeResources({ envMap, pmrem, renderer });
  return out;
}

const thumbs = {
  units: await bakeCategory({
    ids: CLASS_IDS,
    size: UNIT_THUMB_SIZE,
    lookAtY: 0.45,
    bakeOne: bakeUnitThumbnail,
  }),
  items: await bakeCategory({
    ids: ITEM_IDS,
    size: ITEM_THUMB_SIZE,
    lookAtY: 0.45,
    bakeOne: bakeItemThumbnail,
  }),
  'map-props': await bakeCategory({
    ids: MAP_PROP_KINDS,
    size: ITEM_THUMB_SIZE,
    lookAtY: 0.45,
    bakeOne: bakeMapPropThumbnail,
  }),
  nav: await bakeCategory({
    ids: NAV_ICON_IDS,
    size: NAV_THUMB_SIZE,
    lookAtY: 0.12,
    bakeOne: bakeNavThumbnail,
  }),
  side: await bakeCategory({
    ids: SIDE_ICON_IDS,
    size: SIDE_THUMB_SIZE,
    lookAtY: 0.12,
    bakeOne: bakeSideThumbnail,
  }),
};

window.__THUMBNAIL_BAKE__ = thumbs;
