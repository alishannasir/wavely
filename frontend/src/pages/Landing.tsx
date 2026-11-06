import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import RulesModal from '../components/RulesModal';
import { startGuestSession } from '../lib/guest';
import { useAuth } from '../store/auth';

export default function Landing() {
  const navigate = useNavigate();
  const user = useAuth((s) => s.user);
  const [showRules, setShowRules] = useState(false);

  function start() {
    // Returning users (account or a still-valid guest) skip the guest sign-in.
    if (user && !user.isGuest) navigate('/home');
    else setShowRules(true);
  }

  return (
    <main className="min-h-screen flex flex-col items-center justify-center gap-8 p-6 max-w-md mx-auto text-center">
      <h1 className="text-4xl font-bold">Meet someone new.</h1>
      <p className="text-zinc-400">
        Random 1:1 video chat with people around the world. 18+ only.
      </p>
      <div className="w-full flex flex-col gap-3">
        <button
          onClick={start}
          className="w-full rounded-xl bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-semibold py-4 text-lg transition-colors"
        >
          Start now
        </button>
        <Link
          to="/signup"
          className="w-full rounded-xl border border-zinc-700 hover:border-zinc-500 py-4 transition-colors"
        >
          Create an account
        </Link>
        <Link to="/login" className="text-sm text-zinc-400 hover:text-zinc-200">
          I already have an account
        </Link>
      </div>
      <p className="text-xs text-zinc-500">
        No signup needed to chat. An account unlocks friends, messaging and filters.
      </p>
      {showRules && (
        <RulesModal
          onCancel={() => setShowRules(false)}
          onAccept={async () => {
            await startGuestSession();
            setShowRules(false);
            navigate('/call');
          }}
        />
      )}
    </main>
  );
}
