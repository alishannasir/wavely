import { io, Socket } from 'socket.io-client';
import { useAuth } from '../store/auth';
import { getDeviceId } from './device';

let socket: Socket | null = null;
let retries = 0;

export function getSocket(): Socket {
  if (!socket) {
    const base = import.meta.env.VITE_WS_URL ?? 'http://localhost:3000';
    const s = io(base, { auth: { token: useAuth.getState().token, deviceId: getDeviceId() } });
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

export function resetSocket(): void {
  socket?.disconnect();
  socket = null;
  retries = 0;
}
