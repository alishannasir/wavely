import { api } from './api';
import { resetSocket } from './socket';
import { useAuth, User } from '../store/auth';

/** Creates a guest session (random chat only). The caller must have shown the 18+/rules notice first. */
export async function startGuestSession(): Promise<void> {
  const res = await api<{ access_token: string; user: User }>('/auth/guest', {
    method: 'POST',
    body: JSON.stringify({ adult: true, rules: true }),
  });
  resetSocket(); // drop any socket that was opened with an old token
  useAuth.getState().setToken(res.access_token);
  useAuth.getState().setUser(res.user);
}
