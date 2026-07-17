import { Suspense, lazy } from 'react';
import { BrowserRouter, Route, Routes } from 'react-router-dom';

// Route-level code splitting: initial bundle only ships landing/auth.
const Landing = lazy(() => import('./pages/Landing'));
const Login = lazy(() => import('./pages/Login'));
const Signup = lazy(() => import('./pages/Signup'));
const AuthCallback = lazy(() => import('./pages/AuthCallback'));
const Onboarding = lazy(() => import('./pages/Onboarding'));
const Home = lazy(() => import('./pages/Home'));
const Call = lazy(() => import('./pages/Call'));
const Upgrade = lazy(() => import('./pages/Upgrade'));
const Friends = lazy(() => import('./pages/Friends'));
const RegionBlocked = lazy(() => import('./pages/RegionBlocked'));

function Skeleton() {
  return (
    <div className="min-h-screen flex flex-col gap-4 p-6 max-w-md mx-auto animate-pulse">
      <div className="h-8 w-2/3 rounded bg-zinc-800" />
      <div className="h-4 w-full rounded bg-zinc-800" />
      <div className="h-4 w-5/6 rounded bg-zinc-800" />
      <div className="h-12 w-full rounded-xl bg-zinc-800 mt-4" />
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Suspense fallback={<Skeleton />}>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/login" element={<Login />} />
          <Route path="/signup" element={<Signup />} />
          <Route path="/auth/callback" element={<AuthCallback />} />
          <Route path="/onboarding" element={<Onboarding />} />
          <Route path="/home" element={<Home />} />
          <Route path="/call" element={<Call />} />
          <Route path="/upgrade" element={<Upgrade />} />
          <Route path="/friends" element={<Friends />} />
          <Route path="/unavailable" element={<RegionBlocked />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}
