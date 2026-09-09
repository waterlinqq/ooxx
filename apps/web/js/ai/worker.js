import { searchBestAction } from './search.js';

self.onmessage = (event) => {
  const { id, state, options } = event.data;
  try {
    const searchState = {
      ...state,
      actedUnitIds: new Set(state.actedUnitIds ?? []),
    };
    const action = searchBestAction(searchState, options);
    self.postMessage({ id, action });
  } catch (error) {
    self.postMessage({
      id,
      error: error instanceof Error ? error.message : String(error),
    });
  }
};
