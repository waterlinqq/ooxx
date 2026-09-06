const NICKNAME_KEY = 'ooxx-player-nickname';

/** @returns {string} e.g. Player482193 */
export function generateDefaultNickname() {
  const n = Math.floor(100000 + Math.random() * 900000);
  return `Player${n}`;
}

/** Local display name; generates and persists on first call. */
export function getPlayerNickname() {
  const stored = localStorage.getItem(NICKNAME_KEY)?.trim();
  if (stored) return stored;
  const name = generateDefaultNickname();
  localStorage.setItem(NICKNAME_KEY, name);
  return name;
}

export function setPlayerNickname(name) {
  const trimmed = name?.trim();
  if (!trimmed) return;
  localStorage.setItem(NICKNAME_KEY, trimmed);
}
