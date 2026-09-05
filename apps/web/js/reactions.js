/** In-match emoji reactions — ids shared with server via @ooxx/shared/protocol.js */

export const REACTIONS = [
  { id: 'happy', label: '開心', color: '#fbbf24' },
  { id: 'angry', label: '生氣', color: '#ef4444' },
  { id: 'cry', label: '哭', color: '#60a5fa' },
  { id: 'evil', label: '邪惡', color: '#a855f7' },
];

export const REACTION_COOLDOWN_MS = 2000;
export const REACTION_DISPLAY_MS = 2200;

const FACE = '#f4d03f';

function svgWrap(size, inner) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="${size}" height="${size}" aria-hidden="true">${inner}</svg>`;
}

const REACTION_SVGS = {
  happy: (size) => svgWrap(size, `
    <polygon points="32,6 54,18 54,42 32,58 10,42 10,18" fill="${FACE}" stroke="#c9a227" stroke-width="2"/>
    <ellipse cx="22" cy="28" rx="4" ry="5" fill="#2d3436"/>
    <ellipse cx="42" cy="28" rx="4" ry="5" fill="#2d3436"/>
    <path d="M20 40 Q32 50 44 40" fill="none" stroke="#2d3436" stroke-width="3" stroke-linecap="round"/>
    <circle cx="18" cy="34" r="3" fill="#ff8fab" opacity="0.55"/>
    <circle cx="46" cy="34" r="3" fill="#ff8fab" opacity="0.55"/>
  `),
  angry: (size) => svgWrap(size, `
    <polygon points="32,6 54,18 54,42 32,58 10,42 10,18" fill="${FACE}" stroke="#c9a227" stroke-width="2"/>
    <path d="M16 24 L26 28" stroke="#2d3436" stroke-width="3" stroke-linecap="round"/>
    <path d="M48 24 L38 28" stroke="#2d3436" stroke-width="3" stroke-linecap="round"/>
    <ellipse cx="22" cy="32" rx="4" ry="4.5" fill="#2d3436"/>
    <ellipse cx="42" cy="32" rx="4" ry="4.5" fill="#2d3436"/>
    <path d="M22 44 Q32 38 42 44" fill="none" stroke="#2d3436" stroke-width="3" stroke-linecap="round"/>
    <ellipse cx="32" cy="48" rx="6" ry="3" fill="#ef4444" opacity="0.35"/>
  `),
  cry: (size) => svgWrap(size, `
    <polygon points="32,6 54,18 54,42 32,58 10,42 10,18" fill="${FACE}" stroke="#c9a227" stroke-width="2"/>
    <ellipse cx="22" cy="30" rx="4" ry="5" fill="#2d3436"/>
    <ellipse cx="42" cy="30" rx="4" ry="5" fill="#2d3436"/>
    <path d="M24 44 Q32 40 40 44" fill="none" stroke="#2d3436" stroke-width="3" stroke-linecap="round"/>
    <path d="M18 34 L16 46 L22 42 Z" fill="#60a5fa"/>
    <path d="M46 34 L48 46 L42 42 Z" fill="#60a5fa"/>
    <ellipse cx="16" cy="48" rx="2" ry="3" fill="#3b82f6" opacity="0.7"/>
    <ellipse cx="48" cy="48" rx="2" ry="3" fill="#3b82f6" opacity="0.7"/>
  `),
  evil: (size) => svgWrap(size, `
    <polygon points="32,6 54,18 54,42 32,58 10,42 10,18" fill="#d4a843" stroke="#7c3aed" stroke-width="2"/>
    <path d="M14 14 L20 22 M50 14 L44 22" stroke="#7c3aed" stroke-width="3" stroke-linecap="round"/>
    <polygon points="12,10 16,20 8,18" fill="#7c3aed"/>
    <polygon points="52,10 48,20 56,18" fill="#7c3aed"/>
    <ellipse cx="22" cy="30" rx="5" ry="6" fill="#2d3436"/>
    <ellipse cx="42" cy="30" rx="5" ry="6" fill="#2d3436"/>
    <ellipse cx="24" cy="28" rx="1.5" ry="2" fill="#a855f7"/>
    <ellipse cx="44" cy="28" rx="1.5" ry="2" fill="#a855f7"/>
    <path d="M20 42 Q32 52 44 40" fill="none" stroke="#2d3436" stroke-width="3" stroke-linecap="round"/>
    <polygon points="28,42 32,46 36,42 32,48" fill="#ef4444"/>
  `),
};

export function getReactionDef(id) {
  return REACTIONS.find((r) => r.id === id) ?? null;
}

export function fillReactionIcon(el, id, size = 40) {
  const fn = REACTION_SVGS[id];
  if (!fn || !el) return;
  el.innerHTML = fn(size);
}
