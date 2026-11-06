import { useState } from 'react';

interface Props {
  onAccept: () => Promise<void>;
  onCancel: () => void;
}

export default function RulesModal({ onAccept, onCancel }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function accept() {
    setBusy(true);
    setError(null);
    try {
      await onAccept();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="w-full max-w-md rounded-2xl border border-zinc-700 bg-zinc-900 p-6 flex flex-col gap-4">
        <h2 className="text-xl font-bold">Before you start</h2>
        <p className="text-sm text-zinc-300">By pressing “I agree”, you confirm you are 18 or older and agree to:</p>
        <ul className="list-disc pl-5 text-sm text-zinc-300 flex flex-col gap-1">
          <li>Keep your face visible and be respectful.</li>
          <li>No nudity, sexual content, harassment, hate or threats.</li>
          <li>Never share personal information such as your address or passwords.</li>
          <li>Anyone you meet is a stranger. You can skip or leave at any time.</li>
        </ul>
        <p className="text-xs text-zinc-400">
          ⚠️ Safety reminder: use the Report button if someone breaks these rules. Reports include a
          screenshot and are reviewed by moderators. Rule violators are banned, including by device and IP.
        </p>
        {error && <p className="text-sm text-red-400">{error}</p>}
        <div className="flex gap-3">
          <button onClick={onCancel} className="flex-1 rounded-xl border border-zinc-700 py-3 text-zinc-300">
            Cancel
          </button>
          <button
            onClick={accept}
            disabled={busy}
            className="flex-1 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-semibold py-3 disabled:opacity-60"
          >
            I agree
          </button>
        </div>
      </div>
    </div>
  );
}
