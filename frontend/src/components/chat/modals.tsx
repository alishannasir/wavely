import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Modal from '../ui/Modal';
import ChunkyButton from '../ui/ChunkyButton';
import { api } from '../../lib/api';
import { flagEmoji } from '../../lib/flag';
import { inputCls } from '../../lib/ui';
import { useAuth, User } from '../../store/auth';
import { useDevices } from '../../store/devices';
import { useFilters } from '../../store/filters';

export const REPORT_REASONS = [
  { code: 'NUDITY', label: 'Nudity / sexual content' },
  { code: 'HARASSMENT', label: 'Harassment' },
  { code: 'MINOR_CONCERN', label: 'Possibly a minor' },
  { code: 'SPAM', label: 'Spam' },
  { code: 'OTHER', label: 'Other' },
] as const;

export function ReportSheet({ open, onClose, onPick }: { open: boolean; onClose: () => void; onPick: (code: string) => void }) {
  return (
    <Modal open={open} onClose={onClose} labelledBy="report-title" className="max-w-sm">
      <h2 id="report-title" className="mb-3 font-display text-xl font-semibold text-brand">Report this person</h2>
      <div className="flex flex-col gap-2">
        {REPORT_REASONS.map((r) => (
          <button
            key={r.code}
            onClick={() => onPick(r.code)}
            className="rounded-xl border border-line px-4 py-3 text-left transition hover:border-danger hover:bg-surface-2"
          >
            {r.label}
          </button>
        ))}
      </div>
      <p className="mt-3 text-xs text-muted">Moderators receive a screenshot of their video and the recent messages.</p>
    </Modal>
  );
}

const POPULAR_COUNTRIES = ['US', 'GB', 'CA', 'AU', 'DE', 'FR', 'ES', 'IT', 'NL', 'AE', 'SA', 'QA', 'NZ', 'IE'];

/** Country / looking-for filters. Premium feature: free users see why and how to get it. */
export function FiltersModal({ open, onClose, filtersEnabled }: { open: boolean; onClose: () => void; filtersEnabled: boolean }) {
  const filters = useFilters();
  const isGuest = useAuth((s) => s.user?.isGuest);
  return (
    <Modal open={open} onClose={onClose} labelledBy="filters-title">
      <h2 id="filters-title" className="mb-4 font-display text-xl font-semibold text-brand">Who do you want to meet?</h2>
      {filtersEnabled ? (
        <div className="flex flex-col gap-4">
          <label className="flex flex-col gap-1 text-sm text-muted">
            Country
            <select className={inputCls} value={filters.preferredCountry ?? ''} onChange={(e) => filters.setPreferredCountry(e.target.value || null)}>
              <option value="">🌐 Anywhere</option>
              {POPULAR_COUNTRIES.map((c) => (
                <option key={c} value={c}>
                  {flagEmoji(c)} {c}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm text-muted">
            Show me
            <select className={inputCls} value={filters.preferredGender ?? ''} onChange={(e) => filters.setPreferredGender(e.target.value || null)}>
              <option value="">Anyone</option>
              <option value="MALE">Men</option>
              <option value="FEMALE">Women</option>
              <option value="OTHER">Other</option>
            </select>
          </label>
          <p className="text-xs text-muted">If nobody matches for a while, the filters are relaxed so you are not left waiting.</p>
          <ChunkyButton onClick={onClose}>Done</ChunkyButton>
        </div>
      ) : (
        <div className="text-center">
          <div className="mb-2 text-4xl" aria-hidden>🔒</div>
          <p className="mb-4 text-muted">Choosing a country or who you meet is a Premium feature.</p>
          <ChunkyButton to={isGuest ? '/signup' : '/upgrade'}>{isGuest ? 'Create an account' : 'Go Premium'}</ChunkyButton>
        </div>
      )}
    </Modal>
  );
}

const GENDERS = [
  { code: 'MALE', label: 'Male', emoji: '👦' },
  { code: 'FEMALE', label: 'Female', emoji: '👧' },
  { code: 'OTHER', label: 'Other', emoji: '🧑' },
] as const;

export function genderEmoji(code: string | null | undefined): string {
  return GENDERS.find((g) => g.code === code)?.emoji ?? '🧑';
}

/** "I am" picker: saves the gender on the profile (used by other people's filters). */
export function GenderModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const gender = useAuth((s) => s.user?.gender);
  const [error, setError] = useState<string | null>(null);
  async function pick(code: string) {
    setError(null);
    try {
      const updated = await api<User>('/users/me', { method: 'PATCH', body: JSON.stringify({ gender: code }) });
      useAuth.getState().setUser(updated);
      onClose();
    } catch (err) {
      setError((err as Error).message);
    }
  }
  return (
    <Modal open={open} onClose={onClose} labelledBy="gender-title" className="max-w-sm">
      <h2 id="gender-title" className="mb-4 font-display text-xl font-semibold text-brand">I am…</h2>
      <div className="grid grid-cols-3 gap-2">
        {GENDERS.map((g) => (
          <button
            key={g.code}
            onClick={() => pick(g.code)}
            aria-pressed={gender === g.code}
            className={`flex flex-col items-center gap-1 rounded-2xl border-2 p-3 transition hover:border-brand ${gender === g.code ? 'border-brand bg-brand-50' : 'border-line'}`}
          >
            <span className="text-3xl" aria-hidden>{g.emoji}</span>
            <span className="text-sm font-semibold">{g.label}</span>
          </button>
        ))}
      </div>
      {error && <p role="alert" className="mt-3 text-sm font-semibold text-danger">{error}</p>}
    </Modal>
  );
}

/** Camera / microphone pickers, account links and log out. */
export function SettingsModal({ open, onClose, onDevicesChanged }: { open: boolean; onClose: () => void; onDevicesChanged: () => void }) {
  const navigate = useNavigate();
  const user = useAuth((s) => s.user);
  const { videoDeviceId, audioDeviceId, setVideoDeviceId, setAudioDeviceId } = useDevices();
  const [cams, setCams] = useState<MediaDeviceInfo[]>([]);
  const [mics, setMics] = useState<MediaDeviceInfo[]>([]);

  useEffect(() => {
    if (!open) return;
    navigator.mediaDevices
      ?.enumerateDevices()
      .then((all) => {
        setCams(all.filter((d) => d.kind === 'videoinput'));
        setMics(all.filter((d) => d.kind === 'audioinput'));
      })
      .catch(() => undefined);
  }, [open]);

  return (
    <Modal open={open} onClose={onClose} labelledBy="settings-title">
      <h2 id="settings-title" className="mb-4 font-display text-xl font-semibold text-brand">Settings</h2>
      <div className="flex flex-col gap-3">
        {cams.length > 1 && (
          <label className="flex flex-col gap-1 text-sm text-muted">
            Camera
            <select
              className={inputCls}
              value={videoDeviceId ?? cams[0]?.deviceId ?? ''}
              onChange={(e) => {
                setVideoDeviceId(e.target.value);
                onDevicesChanged();
              }}
            >
              {cams.map((d, i) => <option key={d.deviceId} value={d.deviceId}>{d.label || `Camera ${i + 1}`}</option>)}
            </select>
          </label>
        )}
        {mics.length > 1 && (
          <label className="flex flex-col gap-1 text-sm text-muted">
            Microphone
            <select
              className={inputCls}
              value={audioDeviceId ?? mics[0]?.deviceId ?? ''}
              onChange={(e) => {
                setAudioDeviceId(e.target.value);
                onDevicesChanged();
              }}
            >
              {mics.map((d, i) => <option key={d.deviceId} value={d.deviceId}>{d.label || `Microphone ${i + 1}`}</option>)}
            </select>
          </label>
        )}
        {user?.isGuest ? (
          <ChunkyButton to="/signup" variant="brand">Create an account</ChunkyButton>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            <ChunkyButton to="/friends" variant="neutral">Friends</ChunkyButton>
            <ChunkyButton to="/upgrade" variant="neutral">Plan</ChunkyButton>
          </div>
        )}
        <Link to="/rules" className="text-center text-sm text-accent underline">Chat rules</Link>
        <button
          onClick={() => {
            useAuth.getState().logout();
            onClose();
            navigate('/');
          }}
          className="mt-1 font-display text-lg font-semibold text-danger"
        >
          Log out
        </button>
      </div>
    </Modal>
  );
}

export function LimitModal({ open, message, onClose }: { open: boolean; message: string | null; onClose: () => void }) {
  const isGuest = useAuth((s) => s.user?.isGuest);
  return (
    <Modal open={open} onClose={onClose} labelledBy="limit-title" className="text-center">
      <div className="mb-2 text-4xl" aria-hidden>⏳</div>
      <h2 id="limit-title" className="mb-2 font-display text-2xl font-semibold text-brand">Daily limit reached</h2>
      <p className="mb-5 text-muted">{message}</p>
      <div className="flex flex-col gap-2">
        <ChunkyButton to={isGuest ? '/signup' : '/upgrade'}>{isGuest ? 'Create an account' : 'Go Premium'}</ChunkyButton>
        <button onClick={onClose} className="text-sm text-muted hover:text-ink">Maybe later</button>
      </div>
    </Modal>
  );
}
