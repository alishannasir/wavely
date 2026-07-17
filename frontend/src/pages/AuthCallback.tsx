import { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuth, User } from '../store/auth';

export default function AuthCallback() {
  const navigate = useNavigate();
  const [params] = useSearchParams();

  useEffect(() => {
    const token = params.get('token');
    if (!token) {
      navigate('/login');
      return;
    }
    useAuth.getState().setToken(token);
    api<User>('/users/me')
      .then((user) => {
        useAuth.getState().setUser(user);
        // OAuth signups have no birthdate yet; onboarding collects it (18+ gate).
        navigate(user.birthdate ? '/home' : '/onboarding');
      })
      .catch(() => navigate('/login'));
  }, [params, navigate]);

  return <main className="min-h-screen flex items-center justify-center text-zinc-400">Signing you in…</main>;
}
