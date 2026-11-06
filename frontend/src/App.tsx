import { Suspense, lazy } from 'react';
import { BrowserRouter, Route, Routes, useSearchParams } from 'react-router-dom';

// Route-level code splitting: initial bundle only ships landing/auth.
const Landing = lazy(() => import('./pages/Landing'));
const Login = lazy(() => import('./pages/Login'));
const Signup = lazy(() => import('./pages/Signup'));
const AuthCallback = lazy(() => import('./pages/AuthCallback'));
const Onboarding = lazy(() => import('./pages/Onboarding'));
const Home = lazy(() => import('./pages/Home'));
const Start = lazy(() => import('./pages/Start'));
const Call = lazy(() => import('./pages/Call'));
const Upgrade = lazy(() => import('./pages/Upgrade'));
const Friends = lazy(() => import('./pages/Friends'));
const About = lazy(() => import('./pages/content/About'));
const Why = lazy(() => import('./pages/content/Why'));
const Faq = lazy(() => import('./pages/content/Faq'));
const Rules = lazy(() => import('./pages/content/Rules'));
const Terms = lazy(() => import('./pages/content/Legal').then((m) => ({ default: m.Terms })));
const Privacy = lazy(() => import('./pages/content/Legal').then((m) => ({ default: m.Privacy })));
const RegionBlocked = lazy(() => import('./pages/RegionBlocked'));

/** Transitional: /chat = camera preview, or the call page for friend calls. Replaced by the merged chat screen. */
function ChatRoute() {
  const [params] = useSearchParams();
  return params.get('friend') || params.get('accept') ? <Call /> : <Start />;
}

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
          <Route path="/about" element={<About />} />
          <Route path="/why" element={<Why />} />
          <Route path="/faq" element={<Faq />} />
          <Route path="/rules" element={<Rules />} />
          <Route path="/terms" element={<Terms />} />
          <Route path="/privacy" element={<Privacy />} />
          <Route path="/login" element={<Login />} />
          <Route path="/signup" element={<Signup />} />
          <Route path="/auth/callback" element={<AuthCallback />} />
          <Route path="/onboarding" element={<Onboarding />} />
          <Route path="/home" element={<Home />} />
          <Route path="/chat" element={<ChatRoute />} />
          <Route path="/start" element={<Start />} />
          <Route path="/call" element={<Call />} />
          <Route path="/upgrade" element={<Upgrade />} />
          <Route path="/friends" element={<Friends />} />
          <Route path="/unavailable" element={<RegionBlocked />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}
