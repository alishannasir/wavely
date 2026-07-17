import { io, Socket } from 'socket.io-client';
import { useAuth } from '../store/auth';

let socket: Socket | null = null;

export function getSocket(): Socket {
  if (!socket) {
    const base = import.meta.env.VITE_WS_URL ?? 'http://localhost:3000';
    socket = io(base, { auth: { token: useAuth.getState().token } });
  }
  return socket;
}

export function resetSocket(): void {
  socket?.disconnect();
  socket = null;
}
