import { apiUrl } from './config.js';

const TOKEN_KEY = 'ooxx-guest-token';

export function getAuthToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function setAuthToken(token) {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearAuthToken() {
  localStorage.removeItem(TOKEN_KEY);
}

async function createGuestToken() {
  const res = await fetch(apiUrl('/api/guest'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });
  if (!res.ok) throw new Error('無法建立訪客身份');
  const data = await res.json();
  setAuthToken(data.token);
  return data.token;
}

export async function ensureGuestToken() {
  const token = getAuthToken();
  if (token) return token;
  return createGuestToken();
}

export async function refreshGuestToken() {
  clearAuthToken();
  return createGuestToken();
}
