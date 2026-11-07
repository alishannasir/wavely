import { API_BASE, api } from './api';
import { useAuth } from '../store/auth';

/**
 * "Continue with Google". If the visitor is a guest, a signed token goes along, so that signing in with
 * Google turns their guest session into the Google account instead of losing it.
 */
export async function continueWithGoogle(): Promise<void> {
  let url = `${API_BASE}/auth/google`;
  if (useAuth.getState().user?.isGuest) {
    try {
      const { state } = await api<{ state: string }>('/auth/google/state', { method: 'POST' });
      url += `?state=${encodeURIComponent(state)}`;
    } catch {
      /* fall back to a normal Google sign-in */
    }
  }
  window.location.assign(url);
}
