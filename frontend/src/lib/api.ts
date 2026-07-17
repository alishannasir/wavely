import { useAuth } from '../store/auth';

export const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3000/api';

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = useAuth.getState().token;
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers ?? {}),
    },
  });
  const body = await res.json().catch(() => null);
  if (res.status === 403 && body?.code === 'REGION_BLOCKED') {
    window.location.assign('/unavailable');
    throw new Error('Region blocked');
  }
  if (!res.ok) {
    const message = Array.isArray(body?.message) ? body.message.join(', ') : body?.message;
    throw new Error(message ?? `Request failed (${res.status})`);
  }
  return body as T;
}
