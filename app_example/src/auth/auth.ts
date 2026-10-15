const TOKEN_KEY = 'token';
const REFRESH_TOKEN_KEY = 'refresh_token';

export function saveAuth(token: string, refreshToken?: string) {
  localStorage.setItem(TOKEN_KEY, token);
  if (refreshToken) localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
}

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function clearAuth() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
}

export function isAuthenticated() {
  return Boolean(getToken());
}

export async function checkAuth(): Promise<boolean> {
  const token = getToken();
  if (!token) return false;
  try {
    const base = import.meta.env.VITE_API_BASE || '/api';
    const res = await fetch(`${base}/v1/auth/check`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return res.ok;
  } catch {
    return false;
  }
}

export function buildSsoLoginUrl(applicationId?: string) {
  const appId = applicationId || import.meta.env.VITE_SSO_APPLICATION_ID;
  const EADAFFrontend = import.meta.env.VITE_SSO_EADAF_FRONTEND || 'http://localhost:29527';
  return `${EADAFFrontend}/auth/login?app=${appId}`;
}
