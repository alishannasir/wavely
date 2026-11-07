import { io, Socket } from 'socket.io-client';
import { useAuth } from '../store/auth';
import { getDeviceId } from './device';

let socket: Socket | null = null;
let retries = 0;

export function getSocket(): Socket {
  if (!socket) {
    const base = import.meta.env.VITE_WS_URL ?? 'http://localhost:3000';
    const s = io(base, { withCredentials: true, auth: { deviceId: getDeviceId() } });
    // The server rejects with `connect_error` (UNAUTHORIZED / BANNED / REGION_BLOCKED / SERVER_ERROR).
    // Socket.IO does not retry those by itself; SERVER_ERROR is a temporary hiccup, so retry it.
    s.on('connect_error', (err) => {
      if (err.message === 'SERVER_ERROR' && retries < 5) {
        const delay = Math.min(10_000, 1000 * 2 ** retries++);
        setTimeout(() => {
          if (socket === s && !s.connected) s.connect();
        }, delay);
      }
    });
    s.on('connect', () => {
      retries = 0;
    });
    socket = s;
  }
  return socket;
}

// The socket authenticates once, with the cookie it connects with. Whenever the login changes
// (login, logout, guest start, upgrade, expiry) the old socket must go, or the next user would
// keep acting as the previous one.
useAuth.subscribe((state, prev) => {
  if (state.sessionExpiresAt !== prev.sessionExpiresAt || state.user?.id !== prev.user?.id) resetSocket();
});

export function resetSocket(): void {
  socket?.disconnect();
  socket = null;
  retries = 0;
}
