export class ApiError extends Error {
  constructor(message, code, status) { super(message); this.code = code; this.status = status; }
}
export async function request(path, { method = 'GET', token, body } = {}) {
  const response = await fetch(path, { method, headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(8000) });
  const data = await response.json();
  if (!response.ok) throw new ApiError(data.error.message, data.error.code, response.status);
  return data;
}

export const STREAM_SILENCE_MS = 15000;
export function openStream(session, { onSnapshot, onStatus, onFatal }) {
  let abort;
  let timer;
  let silenceTimer;
  let stopped = false;
  let attempt = 0;
  async function connect() {
    if (stopped) return;
    onStatus(false);
    const connection = new AbortController();
    abort = connection;
    const armWatchdog = () => {
      clearTimeout(silenceTimer);
      silenceTimer = setTimeout(() => {
        onStatus(false);
        connection.abort();
      }, STREAM_SILENCE_MS);
    };
    armWatchdog();
    try {
      const response = await fetch(`/api/rooms/${session.roomId}/stream`, { headers: { Authorization: `Bearer ${session.token}` }, signal: connection.signal });
      if (!response.ok) {
        const data = await response.json();
        throw new ApiError(data.error.message, data.error.code, response.status);
      }
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      while (!stopped) {
        const { done, value } = await reader.read();
        if (done) throw new Error('Stream ended.');
        buffer += decoder.decode(value, { stream: true });
        let newline;
        while ((newline = buffer.indexOf('\n')) !== -1) {
          const line = buffer.slice(0, newline);
          buffer = buffer.slice(newline + 1);
          if (!line) continue;
          const data = JSON.parse(line);
          if (data.error) throw new ApiError(data.error.message, data.error.code, 404);
          if (data.heartbeat === true || data.state) armWatchdog();
          if (data.state) { attempt = 0; onSnapshot(data); onStatus(true); }
        }
      }
    } catch (error) {
      if (stopped) return;
      onStatus(false);
      if (error instanceof ApiError && [401, 404, 409].includes(error.status)) { stopped = true; onFatal(error.message); return; }
      timer = setTimeout(connect, Math.min(3000, 300 * 2 ** attempt++));
    } finally {
      clearTimeout(silenceTimer);
      connection.abort();
    }
  }
  connect();
  return () => { stopped = true; clearTimeout(timer); clearTimeout(silenceTimer); abort?.abort(); };
}
