import { Link } from 'react-router-dom';

export default function Landing() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center gap-8 p-6 max-w-md mx-auto text-center">
      <h1 className="text-4xl font-bold">Meet someone new.</h1>
      <p className="text-zinc-400">
        Random 1:1 video chat with people around the world. 18+ only.
      </p>
      <div className="w-full flex flex-col gap-3">
        <Link
          to="/signup"
          className="w-full rounded-xl bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-semibold py-4 text-lg transition-colors"
        >
          Start Chat
        </Link>
        <Link
          to="/login"
          className="w-full rounded-xl border border-zinc-700 hover:border-zinc-500 py-4 transition-colors"
        >
          I already have an account
        </Link>
      </div>
    </main>
  );
}
