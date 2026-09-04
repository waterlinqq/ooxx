const TOKEN_KEY = 'ooxx-guest-token';

export function getAuthToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function setAuthToken(token) {
  localStorage.setItem(TOKEN_KEY, token);
}

export async function ensureGuestToken() {
  let token = getAuthToken();
  if (token) return token;

  const res = await fetch('/api/guest', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });
  if (!res.ok) throw new Error('無法建立訪客身份');
  const data = await res.json();
  token = data.token;
  setAuthToken(token);
  return token;
}
