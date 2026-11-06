import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface User {
  id: string;
  email: string | null;
  isGuest?: boolean;
  role?: 'USER' | 'MODERATOR' | 'ADMIN';
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
  token: string | null;
  user: User | null;
  setToken: (token: string | null) => void;
  setUser: (user: User | null) => void;
  logout: () => void;
}

/** True if the JWT's exp claim is in the past (or the token is unreadable). Does not verify the signature. */
export function isTokenExpired(token: string | null): boolean {
  if (!token) return true;
  try {
    const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    return typeof payload.exp === 'number' && payload.exp * 1000 <= Date.now();
  } catch {
    return true;
  }
}

export const useAuth = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      user: null,
      setToken: (token) => set({ token }),
      setUser: (user) => set({ user }),
      logout: () => set({ token: null, user: null }),
    }),
    { name: 'ovc-auth' },
  ),
);
