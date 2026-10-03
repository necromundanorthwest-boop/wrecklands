export const SESSION_KEY = 'wrecklands.phase1.session';
export const PENDING_KEY = 'wrecklands.phase1.pending';
export function savedSession() {
  try {
    const value = JSON.parse(sessionStorage.getItem(SESSION_KEY));
    return value && /^[A-Z2-9]{6}$/.test(value.roomId) && ['A', 'B'].includes(value.player) && typeof value.token === 'string' ? value : null;
  } catch { return null; }
}
export function saveSession(value) { sessionStorage.setItem(SESSION_KEY, JSON.stringify({ roomId: value.roomId, player: value.player, token: value.token })); }
export function clearSession() { sessionStorage.removeItem(SESSION_KEY); sessionStorage.removeItem(PENDING_KEY); }
