import { useAuth } from '../store/auth';
import { getDeviceId } from './device';

export const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3000/api';

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const hadSession = useAuth.getState().sessionExpiresAt !== null;
  const res = await fetch(`${API_BASE}${path}`, {
    credentials: 'include', // the login is an HttpOnly cookie
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'X-Device-Id': getDeviceId(),
      ...(options.headers ?? {}),
    },
  });
  const body = await res.json().catch(() => null);
  if (res.status === 403 && body?.code === 'REGION_BLOCKED') {
    window.location.assign('/unavailable');
    throw new Error('Region blocked');
  }
  // Only a dead session ends the session. A 401 with another message (e.g. "Your password is not correct")
  // is an ordinary error the screen should show.
  const sessionEnded = res.status === 401 && (body?.message === 'Unauthorized' || /session has ended/i.test(String(body?.message ?? '')));
  if (sessionEnded && hadSession && !path.startsWith('/auth/') && !path.startsWith('/appeals')) {
    // Expired or revoked session (guest tokens last 4h): start over from the landing page.
    useAuth.getState().logout();
    window.location.assign('/');
    throw new Error('Session expired');
  }
  if (!res.ok) {
    const message = Array.isArray(body?.message) ? body.message.join(', ') : body?.message;
    if (res.status === 429 && !message?.includes(' ')) throw new Error('Too many requests. Please wait a minute and try again.');
    throw new Error(message ?? `Request failed (${res.status})`);
  }
  return body as T;
}
