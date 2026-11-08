import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface User {
  id: string;
  email: string | null;
  isGuest?: boolean;
  role?: 'USER' | 'MODERATOR' | 'ADMIN';
  emailVerifiedAt?: string | null;
  authProvider?: 'EMAIL' | 'GOOGLE' | 'APPLE' | 'GUEST';
  displayName?: string | null;
  avatarUrl?: string | null;
  birthdate?: string | null;
  rulesAcceptedAt?: string | null;
  gender?: string | null;
  country?: string | null;
  currentStreak: number;
  trialEndsAt: string;
  creditCents: number;
}

interface AuthState {
  /**
   * When the login ends (ms since epoch), or null when signed out. The login token itself lives in an
   * HttpOnly cookie that scripts cannot read; this is only what the screens need to know about it.
   */
  sessionExpiresAt: number | null;
  user: User | null;
  /** Called with the token a sign-in returns: remembers when it expires, and does NOT keep the token. */
  setToken: (token: string | null) => void;
  setUser: (user: User | null) => void;
  logout: () => void;
}

/** When a JWT expires (ms since epoch), without verifying it. Null if unreadable. */
export function tokenExpiry(token: string | null): number | null {
  if (!token) return null;
  try {
    const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    return typeof payload.exp === 'number' ? payload.exp * 1000 : Date.now() + 60 * 60 * 1000;
  } catch {
    // Not a readable JWT: still a session, the server decides.
    return Date.now() + 60 * 60 * 1000;
  }
}

/** True when there is no session, or it has run out. */
export function isSessionExpired(expiresAt: number | null): boolean {
  return expiresAt === null || expiresAt <= Date.now();
}

export const useAuth = create<AuthState>()(
  persist(
    (set) => ({
      sessionExpiresAt: null,
      user: null,
      setToken: (token) => set({ sessionExpiresAt: tokenExpiry(token) }),
      setUser: (user) => set({ user }),
      logout: () => {
        set({ sessionExpiresAt: null, user: null });
        // Ask the server to clear the cookie (best effort: the cookie also expires by itself).
        void fetch(`${import.meta.env.VITE_API_URL ?? 'http://localhost:3000/api'}/auth/logout`, { method: 'POST', credentials: 'include' }).catch(() => undefined);
      },
    }),
    {
      name: 'ovc-auth',
      // Only these are saved; an old saved `token` from before cookie logins is dropped on the next write.
      partialize: (s) => ({ sessionExpiresAt: s.sessionExpiresAt, user: s.user }),
    },
  ),
);

/** The signed-in user, or null when signed out or the login has run out (a saved user can outlive its session). */
export function useSignedInUser(): User | null {
  const user = useAuth((s) => s.user);
  const expiresAt = useAuth((s) => s.sessionExpiresAt);
  return user && !isSessionExpired(expiresAt) ? user : null;
}
