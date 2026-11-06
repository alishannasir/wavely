import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import RulesModal from '../components/RulesModal';
import { api } from '../lib/api';
import { useAuth, User } from '../store/auth';
import { useDevices } from '../store/devices';

const selectCls =
  'w-full rounded-xl bg-zinc-900 border border-zinc-700 px-3 py-2 text-sm focus:outline-none focus:border-emerald-500';

/** Camera preview + device picker. The rules/18+ notice is shown here if not accepted yet. */
export default function Start() {
  const navigate = useNavigate();
  const user = useAuth((s) => s.user);
  const { videoDeviceId, audioDeviceId, setVideoDeviceId, setAudioDeviceId } = useDevices();
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [cams, setCams] = useState<MediaDeviceInfo[]>([]);
  const [mics, setMics] = useState<MediaDeviceInfo[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [showRules, setShowRules] = useState(false);

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  const openPreview = useCallback(async () => {
    stopStream();
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: videoDeviceId ? { deviceId: { ideal: videoDeviceId } } : true,
        audio: audioDeviceId ? { deviceId: { ideal: audioDeviceId } } : true,
      });
      streamRef.current = stream;
      if (videoRef.current) videoRef.current.srcObject = stream;
      const all = await navigator.mediaDevices.enumerateDevices(); // labels are available after permission
      setCams(all.filter((d) => d.kind === 'videoinput'));
      setMics(all.filter((d) => d.kind === 'audioinput'));
    } catch (err) {
      const name = (err as DOMException).name;
      setError(
        name === 'NotAllowedError'
          ? 'Camera and microphone access is blocked. Allow it in your browser settings, then try again.'
          : name === 'NotFoundError'
            ? 'No camera or microphone found.'
            : 'Could not open your camera.',
      );
    }
  }, [videoDeviceId, audioDeviceId, stopStream]);

  useEffect(() => {
    if (!user) {
      navigate('/');
      return;
    }
    if (!user.rulesAcceptedAt) {
      setShowRules(true);
      return;
    }
    void openPreview();
    return stopStream;
  }, [user, navigate, openPreview, stopStream]);

  function begin() {
    stopStream(); // release the camera so the call can take it
    navigate('/call');
  }

  if (!user) return null;

  return (
    <main className="min-h-screen flex flex-col gap-5 p-6 max-w-md mx-auto justify-center">
      <h1 className="text-2xl font-bold">Check your camera</h1>
      <div className="relative aspect-[3/4] w-full overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900">
        <video ref={videoRef} autoPlay playsInline muted className="h-full w-full object-cover -scale-x-100" />
        {error && (
          <div className="absolute inset-0 flex items-center justify-center p-6 text-center text-sm text-zinc-300">
            {error}
          </div>
        )}
      </div>

      {cams.length > 1 && (
        <select
          className={selectCls}
          value={videoDeviceId ?? cams[0]?.deviceId ?? ''}
          onChange={(e) => setVideoDeviceId(e.target.value)}
          aria-label="Camera"
        >
          {cams.map((d, i) => (
            <option key={d.deviceId} value={d.deviceId}>
              {d.label || `Camera ${i + 1}`}
            </option>
          ))}
        </select>
      )}
      {mics.length > 1 && (
        <select
          className={selectCls}
          value={audioDeviceId ?? mics[0]?.deviceId ?? ''}
          onChange={(e) => setAudioDeviceId(e.target.value)}
          aria-label="Microphone"
        >
          {mics.map((d, i) => (
            <option key={d.deviceId} value={d.deviceId}>
              {d.label || `Microphone ${i + 1}`}
            </option>
          ))}
        </select>
      )}

      <p className="text-xs text-zinc-500">Keep your face visible. Rule violators are banned.</p>
      <div className="flex gap-3">
        <button onClick={() => navigate(-1)} className="flex-1 rounded-xl border border-zinc-700 py-3 text-zinc-300">
          Back
        </button>
        {error ? (
          <button onClick={() => void openPreview()} className="flex-1 rounded-xl bg-emerald-500 text-zinc-950 font-semibold py-3">
            Try again
          </button>
        ) : (
          <button
            onClick={begin}
            disabled={!streamRef.current && !cams.length}
            className="flex-1 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-semibold py-3 disabled:opacity-50"
          >
            Start chat
          </button>
        )}
      </div>

      {showRules && (
        <RulesModal
          onCancel={() => navigate('/home')}
          onAccept={async () => {
            const updated = await api<User>('/users/me/accept-rules', { method: 'POST' });
            useAuth.getState().setUser(updated);
            setShowRules(false);
          }}
        />
      )}
    </main>
  );
}
