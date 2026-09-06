/** In-match emoji reactions — ids shared with server via @ooxx/shared/protocol.js */

export const REACTIONS = [
  { id: 'happy', label: '開心', color: '#fbbf24' },
  { id: 'angry', label: '生氣', color: '#ef4444' },
  { id: 'cry', label: '難過', color: '#60a5fa' },
  { id: 'evil', label: '邪惡', color: '#a855f7' },
  { id: 'surprised', label: '驚訝', color: '#f97316' },
  { id: 'embarrassed', label: '尷尬', color: '#f472b6' },
];

export const REACTION_COOLDOWN_MS = 2000;
export const REACTION_DISPLAY_MS = 2600;

const STROKE = '#b8891e';
const FACE = '#f4d03f';
const INK = '#1e293b';

function svgWrap(kind, size, inner) {
  return `<svg class="rx-svg rx-${kind}" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="${size}" height="${size}" overflow="visible" aria-hidden="true"><g class="rx-root">${inner}</g></svg>`;
}

function roundFace(tint = FACE, stroke = STROKE) {
  return `<circle class="rx-head" cx="32" cy="32" r="26" fill="${tint}" stroke="${stroke}" stroke-width="2"/>`;
}

function eye(cx, cy, { rx = 4.1, ry = 4.8, pupil = 1.85, dx = 0.3, dy = 0.2 } = {}) {
  return `
    <g class="rx-eye">
      <ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="#fff" stroke="${INK}" stroke-width="1.15"/>
      <circle cx="${cx + dx}" cy="${cy + dy}" r="${pupil}" fill="${INK}"/>
    </g>
  `;
}

function brow(cx, cy, angle) {
  const rad = (angle * Math.PI) / 180;
  const dx = Math.cos(rad) * 8;
  const dy = Math.sin(rad) * 2.8;
  return `<path class="rx-brow" d="M${cx - dx} ${cy - dy} Q${cx} ${cy - 1.2} ${cx + dx} ${cy - dy}" fill="none" stroke="${INK}" stroke-width="2.6" stroke-linecap="round"/>`;
}

function blush(cx, cy) {
  return `<ellipse class="rx-blush" cx="${cx}" cy="${cy}" rx="5" ry="3.2" fill="#ff8fab" opacity="0.45"/>`;
}

function laughMouth() {
  return `
    <g class="rx-mouth">
      <path d="M21 39 Q21 52.5 32 53 Q43 52.5 43 39 Q32 41 21 39 Z" fill="${INK}"/>
      <rect x="22.8" y="39.2" width="18.4" height="4.3" rx="1.3" fill="#fff"/>
      <ellipse cx="32" cy="49.2" rx="5.8" ry="2.8" fill="#e11d48"/>
    </g>
  `;
}

function grimaceMouth() {
  return `
    <g class="rx-mouth">
      <rect x="18.5" y="41" width="27" height="9.5" rx="2.8" fill="${INK}"/>
      <rect x="19.8" y="42.1" width="24.4" height="3.4" rx="0.9" fill="#fff"/>
      <rect x="19.8" y="46.3" width="24.4" height="3" rx="0.9" fill="#fff"/>
      <path d="M24.6 42.1 V49.3 M29.5 42.1 V49.3 M34.4 42.1 V49.3 M39.3 42.1 V49.3" stroke="${INK}" stroke-width="0.7"/>
    </g>
  `;
}

const REACTION_SVGS = {
  happy: (size) => svgWrap('happy', size, `
    ${roundFace()}
    ${eye(21.5, 26.5, { rx: 4.1, ry: 4.4, pupil: 1.75 })}
    ${eye(42.5, 26.5, { rx: 4.1, ry: 4.4, pupil: 1.75 })}
    ${blush(14, 36)}
    ${blush(50, 36)}
    ${laughMouth()}
  `),

  angry: (size) => svgWrap('angry', size, `
    ${roundFace('#ef8a3a', '#c45c1a')}
    <path class="rx-brow" d="M11 16 L29 27" fill="none" stroke="${INK}" stroke-width="3.4" stroke-linecap="round"/>
    <path class="rx-brow" d="M53 16 L35 27" fill="none" stroke="${INK}" stroke-width="3.4" stroke-linecap="round"/>
    ${eye(21.5, 31, { rx: 3.7, ry: 3.5, pupil: 1.55, dy: 0.55 })}
    ${eye(42.5, 31, { rx: 3.7, ry: 3.5, pupil: 1.55, dy: 0.55 })}
    <path class="rx-mouth" d="M20 43 Q32 36 44 43 Q32 52 20 43 Z" fill="${INK}"/>
    <path d="M7 14 L12 19" fill="none" stroke="#ef4444" stroke-width="2.2" stroke-linecap="round"/>
    <path d="M10 11 L14 17" fill="none" stroke="#ef4444" stroke-width="2.2" stroke-linecap="round"/>
    <path d="M57 14 L52 19" fill="none" stroke="#ef4444" stroke-width="2.2" stroke-linecap="round"/>
    <path d="M54 11 L50 17" fill="none" stroke="#ef4444" stroke-width="2.2" stroke-linecap="round"/>
  `),

  cry: (size) => svgWrap('cry', size, `
    ${roundFace('#edd06a')}
    ${brow(19, 21, 20)}
    ${brow(45, 21, -20)}
    ${eye(21.5, 28, { rx: 4.1, ry: 4.8, pupil: 1.8, dy: 0.45 })}
    ${eye(42.5, 28, { rx: 4.1, ry: 4.8, pupil: 1.8, dy: 0.45 })}
    <path class="rx-mouth" d="M21 45 Q32 40 43 45" fill="none" stroke="${INK}" stroke-width="2.7" stroke-linecap="round"/>
    <path class="rx-tear rx-tear-l" d="M17 34 Q15 42 16 50" fill="none" stroke="#60a5fa" stroke-width="2.8" stroke-linecap="round"/>
    <path class="rx-tear rx-tear-r" d="M47 34 Q49 42 48 50" fill="none" stroke="#60a5fa" stroke-width="2.8" stroke-linecap="round"/>
  `),

  evil: (size) => svgWrap('evil', size, `
    ${roundFace('#d4a843')}
    <polygon class="rx-horn rx-horn-l" points="12,8 18,21 6,18" fill="#7c3aed"/>
    <polygon class="rx-horn rx-horn-r" points="52,8 46,21 58,18" fill="#7c3aed"/>
    <path class="rx-brow" d="M14 24 L26 28" stroke="${INK}" stroke-width="2.6" stroke-linecap="round"/>
    <path class="rx-brow" d="M50 24 L38 28" stroke="${INK}" stroke-width="2.6" stroke-linecap="round"/>
    ${eye(21.5, 31, { rx: 4.1, ry: 4.7, pupil: 1.8, dx: 0.75, dy: 0.1 })}
    ${eye(42.5, 31, { rx: 4.1, ry: 4.7, pupil: 1.8, dx: -0.75, dy: 0.1 })}
    <path class="rx-mouth" d="M18 43 Q32 54 46 41" fill="none" stroke="${INK}" stroke-width="2.8" stroke-linecap="round"/>
  `),

  surprised: (size) => svgWrap('surprised', size, `
    ${roundFace('#f9dc5c')}
    ${brow(19, 18, -16)}
    ${brow(45, 18, 16)}
    ${eye(21.5, 27.5, { rx: 4.5, ry: 5.1, pupil: 1.9 })}
    ${eye(42.5, 27.5, { rx: 4.5, ry: 5.1, pupil: 1.9 })}
    <ellipse class="rx-mouth" cx="32" cy="46" rx="4.8" ry="5.8" fill="${INK}"/>
  `),

  embarrassed: (size) => svgWrap('embarrassed', size, `
    ${roundFace('#f2cc55')}
    ${eye(21.5, 27.5, { rx: 4.1, ry: 4.7, pupil: 1.75, dx: 1.4, dy: 0.1 })}
    ${eye(42.5, 27.5, { rx: 4.1, ry: 4.7, pupil: 1.75, dx: 1.4, dy: 0.1 })}
    ${grimaceMouth()}
  `),
};

export function getReactionDef(id) {
  const resolved = id === 'sad' ? 'cry' : id;
  return REACTIONS.find((r) => r.id === resolved) ?? null;
}

export function fillReactionIcon(el, id, size = 40) {
  const fn = REACTION_SVGS[id === 'sad' ? 'cry' : id];
  if (!fn || !el) return;
  el.innerHTML = fn(size);
}
