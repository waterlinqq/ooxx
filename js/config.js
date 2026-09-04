/** API / WebSocket base URL. Production: VITE_API_BASE=http://Elastic-IP */
export const API_BASE = (import.meta.env.VITE_API_BASE ?? '').replace(/\/$/, '');

export function apiUrl(path) {
  const p = path.startsWith('/') ? path : `/${path}`;
  return API_BASE ? `${API_BASE}${p}` : p;
}

export function wsUrl() {
  if (API_BASE) {
    const u = new URL(API_BASE);
    const proto = u.protocol === 'https:' ? 'wss' : 'ws';
    return `${proto}://${u.host}/ws`;
  }
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  return `${proto}://${location.host}/ws`;
}
