import { captureFrame } from '../lib/evidence';
import { NsfwScanner } from '../lib/nsfw';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import type { Room } from 'livekit-client';
import { getSocket } from '../lib/socket';
import { api } from '../lib/api';
import { useAuth } from '../store/auth';
import { useDevices } from '../store/devices';
import { flagEmoji } from '../lib/flag';
import { useFilters } from '../store/filters';
import { useBillingStatus } from '../lib/billing';

interface MatchPayload {
  roomName: string;
  token: string;
  url: string;
  sessionId: string;
  /** Seconds of free chat time left today (null = unlimited). The server ends the call at 0. */
  limitSeconds?: number | null;
  peer: { userId: string; displayName: string | null; country: string | null };
}

type CallState = 'searching' | 'connecting' | 'in-call';

const REPORT_REASONS = [
  { code: 'NUDITY', label: 'Nudity / sexual content' },
  { code: 'HARASSMENT', label: 'Harassment' },
  { code: 'MINOR_CONCERN', label: 'Possibly a minor' },
  { code: 'SPAM', label: 'Spam' },
  { code: 'OTHER', label: 'Other' },
] as const;

const secondaryBtn =
  'rounded-xl border border-zinc-700 hover:border-zinc-500 px-4 py-3 transition-colors';

export default function Call() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const friendParam = params.get('friend');
  const acceptParam = params.get('accept');
  const isDirect = Boolean(friendParam || acceptParam);

  const token = useAuth((s) => s.token);
  const { data: billing } = useBillingStatus(Boolean(token));
  const [state, setState] = useState<CallState>('searching');
  const [peer, setPeer] = useState<MatchPayload['peer'] | null>(null);
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);
  const [showReport, setShowReport] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [limitMsg, setLimitMsg] = useState<string | null>(null);
  const [friendRequested, setFriendRequested] = useState(false);

  const roomRef = useRef<Room | null>(null);
  const sessionRef = useRef<MatchPayload | null>(null);
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLDivElement>(null);
  const scannerRef = useRef<NsfwScanner | null>(null);
  const flaggedSessionRef = useRef<string | null>(null);
  const [blurred, setBlurred] = useState(false);
  const [chat, setChat] = useState<{ mine: boolean; text: string; at: number }[]>([]);
  const [draft, setDraft] = useState('');
  const skipRef = useRef<() => void>(() => {});
  const [limitAt, setLimitAt] = useState<number | null>(null); // epoch ms when free time runs out
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);

  const stopScanner = useCallback(() => {
    scannerRef.current?.stop();
    scannerRef.current = null;
    setBlurred(false);
  }, []);

  const disconnectRoom = useCallback(async () => {
    stopScanner();
    await roomRef.current?.disconnect();
    roomRef.current = null;
  }, [stopScanner]);

  const start = useCallback(() => {
    setState('searching');
    setPeer(null);
    setFriendRequested(false);
    if (friendParam) {
      getSocket().emit('call-friend', { friendUserId: friendParam });
    } else if (acceptParam) {
      getSocket().emit('accept-call', { callId: acceptParam });
    } else {
      const { preferredGender, preferredCountry } = useFilters.getState();
      getSocket().emit('find-match', {
        ...(preferredGender ? { preferredGender } : {}),
        ...(preferredCountry ? { preferredCountry } : {}),
      });
    }
  }, [friendParam, acceptParam]);

  useEffect(() => {
    if (!token) {
      navigate('/');
      return;
    }
    const socket = getSocket();

    const startScanner = () => {
      scannerRef.current?.stop();
      const scanner = new NsfwScanner({
        getVideo: () => remoteVideoRef.current,
        onExplicit: (score) => {
          setBlurred(true);
          const session = sessionRef.current;
          // One automatic flag per call: the server turns it into a moderator report with this frame.
          if (session && flaggedSessionRef.current !== session.sessionId) {
            flaggedSessionRef.current = session.sessionId;
            socket.emit('nsfw-flag', {
              sessionId: session.sessionId,
              score,
              evidenceImage: captureFrame(remoteVideoRef.current),
            });
          }
        },
        onClear: () => setBlurred(false),
      });
      scannerRef.current = scanner;
      void scanner.start();
    };

    const onMatch = async (payload: MatchPayload) => {
      sessionRef.current = payload;
      setLimitAt(typeof payload.limitSeconds === 'number' ? Date.now() + payload.limitSeconds * 1000 : null);
      setChat([]);
      setDraft('');
      setPeer(payload.peer);
      setState('connecting');
      // LiveKit SDK is lazy-loaded only when a call actually starts.
      const { Room: LKRoom, RoomEvent, Track } = await import('livekit-client');
      const { videoDeviceId, audioDeviceId } = useDevices.getState();
      const room = new LKRoom({
        ...(videoDeviceId ? { videoCaptureDefaults: { deviceId: videoDeviceId } } : {}),
        ...(audioDeviceId ? { audioCaptureDefaults: { deviceId: audioDeviceId } } : {}),
      });
      roomRef.current = room;
      room.on(RoomEvent.TrackSubscribed, (track) => {
        if (track.kind === Track.Kind.Video && remoteVideoRef.current) {
          track.attach(remoteVideoRef.current);
          startScanner();
        } else if (track.kind === Track.Kind.Audio && audioRef.current) {
          audioRef.current.appendChild(track.attach());
        }
      });
      await room.connect(payload.url, payload.token);
      await room.localParticipant.enableCameraAndMicrophone();
      const camPub = room.localParticipant.getTrackPublication(Track.Source.Camera);
      if (camPub?.videoTrack && localVideoRef.current) {
        camPub.videoTrack.attach(localVideoRef.current);
      }
      setMicOn(true);
      setCamOn(true);
      setState('in-call');
    };

    const onPeerLeft = async () => {
      await disconnectRoom();
      if (isDirect) {
        navigate('/friends');
        return;
      }
      setNotice('Stranger left. Finding someone new\u2026');
      start();
    };

    const onError = (payload: { code?: string; message?: string }) => {
      if (payload?.code === 'AGE_REQUIRED') {
        navigate('/onboarding');
        return;
      }
      if (payload?.code === 'RULES_REQUIRED') {
        navigate('/home');
        return;
      }
      if (payload?.code === 'REGION_BLOCKED') {
        navigate('/unavailable');
        return;
      }
      if (payload?.code === 'BANNED') {
        useAuth.getState().logout();
        navigate('/');
        return;
      }
      setNotice(payload?.message ?? 'Something went wrong.');
    };

    const onLimitReached = (payload: { message?: string }) => {
      void disconnectRoom(); // the server already ended the call; leave the room and show the upgrade prompt
      setLimitAt(null);
      setLimitMsg(payload?.message ?? 'You have reached your daily limit.');
    };

    const onChat = (msg: { text: string; at: number }) =>
      setChat((c) => [...c, { mine: false, text: msg.text, at: msg.at }].slice(-50));

    // The server drops sockets with an invalid/expired token (guest tokens last 4h).
    const onServerDisconnect = (reason: string) => {
      if (reason === 'io server disconnect') {
        useAuth.getState().logout();
        navigate('/');
      }
    };

    const onReplaced = () => {
      // Another tab/device started a call or search for this account.
      disconnectRoom();
      navigate('/home');
    };

    const onRelaxed = () => setNotice('Still searching — widening your filters…');

    const onDeclined = () => {
      setNotice('Your friend declined the call.');
      setTimeout(() => navigate('/friends'), 1500);
    };

    const onUnavailable = (payload: { message?: string }) => {
      setNotice(payload?.message ?? 'Call unavailable.');
      setTimeout(() => navigate('/friends'), 1500);
    };

    socket.on('match-found', onMatch);
    socket.on('call-started', onMatch);
    socket.on('peer-left', onPeerLeft);
    socket.on('match-error', onError);
    socket.on('call-chat', onChat);
    socket.on('disconnect', onServerDisconnect);
    socket.on('session-replaced', onReplaced);
    socket.on('filters-relaxed', onRelaxed);
    socket.on('limit-reached', onLimitReached);
    socket.on('call-declined', onDeclined);
    socket.on('call-unavailable', onUnavailable);
    start();

    return () => {
      socket.off('match-found', onMatch);
      socket.off('call-started', onMatch);
      socket.off('peer-left', onPeerLeft);
      socket.off('match-error', onError);
      socket.off('call-chat', onChat);
      socket.off('disconnect', onServerDisconnect);
      socket.off('session-replaced', onReplaced);
      socket.off('filters-relaxed', onRelaxed);
      socket.off('limit-reached', onLimitReached);
      socket.off('call-declined', onDeclined);
      socket.off('call-unavailable', onUnavailable);
      socket.emit('leave');
      disconnectRoom();
    };
  }, [token, navigate, start, disconnectRoom, isDirect]);

  async function toggleMic() {
    const room = roomRef.current;
    if (!room) return;
    await room.localParticipant.setMicrophoneEnabled(!micOn);
    setMicOn(!micOn);
  }

  async function toggleCam() {
    const room = roomRef.current;
    if (!room) return;
    await room.localParticipant.setCameraEnabled(!camOn);
    setCamOn(!camOn);
  }

  async function skip() {
    setNotice(null);
    getSocket().emit('leave');
    await disconnectRoom();
    start();
  }

  skipRef.current = () => void skip();

  function sendChat(e: React.FormEvent) {
    e.preventDefault();
    const text = draft.trim().slice(0, 500);
    if (!text || state !== 'in-call') return;
    getSocket().emit('call-chat', { text });
    setChat((c) => [...c, { mine: true, text, at: Date.now() }].slice(-50));
    setDraft('');
  }

  // Countdown of free chat time during a call (the server enforces the real limit).
  useEffect(() => {
    if (limitAt === null || state !== 'in-call') {
      setSecondsLeft(null);
      return;
    }
    const tick = () => setSecondsLeft(Math.max(0, Math.round((limitAt - Date.now()) / 1000)));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [limitAt, state]);

  // Esc = Next (random mode). While the report sheet is open it closes that instead; in the chat box it just leaves the box.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      const el = document.activeElement as HTMLElement | null;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')) {
        el.blur();
        return;
      }
      if (showReport) setShowReport(false);
      else if (!isDirect && state === 'in-call') skipRef.current();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [showReport, isDirect, state]);

  async function end() {
    getSocket().emit('leave');
    await disconnectRoom();
    navigate(isDirect ? '/friends' : '/home');
  }

  async function addFriend() {
    const session = sessionRef.current;
    if (!session || friendRequested) return;
    try {
      await api('/friends/requests', {
        method: 'POST',
        body: JSON.stringify({ userId: session.peer.userId }),
      });
      setFriendRequested(true);
      setNotice('Friend request sent.');
    } catch (err) {
      setNotice((err as Error).message);
    }
  }

  async function report(reasonCode: string) {
    const session = sessionRef.current;
    setShowReport(false);
    if (!session) return;
    try {
      await api('/reports', {
        method: 'POST',
        body: JSON.stringify({
          reportedUserId: session.peer.userId,
          sessionId: session.sessionId,
          reasonCode,
          evidenceImage: captureFrame(remoteVideoRef.current),
        }),
      });
      setNotice('Report submitted. Thank you.');
    } catch {
      setNotice('Could not submit report.');
    }
    if (isDirect) {
      await end();
    } else {
      await skip();
    }
  }

  return (
    <main className="fixed inset-0 bg-zinc-950 flex flex-col">
      <div ref={audioRef} className="hidden" />

      <div className="relative flex-1 overflow-hidden">
        <video
          ref={remoteVideoRef}
          autoPlay
          playsInline
          className={`h-full w-full object-cover transition-[filter] ${blurred ? 'blur-3xl' : ''}`}
        />
        {blurred && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/40 p-6 text-center">
            <p className="text-lg font-semibold">Video hidden: possible explicit content</p>
            <p className="text-sm text-zinc-300">It was sent to our moderators. You can skip or show it anyway.</p>
            <span className="flex gap-3">
              <button onClick={() => (isDirect ? end() : skip())} className="rounded-xl bg-emerald-500 px-5 py-2 font-semibold text-zinc-950">
                {isDirect ? 'End call' : 'Next'}
              </button>
              <button onClick={() => setBlurred(false)} className="rounded-xl border border-zinc-500 px-5 py-2">
                Show anyway
              </button>
            </span>
          </div>
        )}

        {state !== 'in-call' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-zinc-950/80">
            <div className="h-10 w-10 rounded-full border-2 border-emerald-400 border-t-transparent animate-spin" />
            <p className="text-zinc-300">
              {state === 'connecting'
                ? 'Connecting\u2026'
                : isDirect
                  ? 'Calling\u2026'
                  : 'Looking for someone\u2026'}
            </p>
            {notice && <p className="text-sm text-zinc-500">{notice}</p>}
            {!isDirect && billing?.adsEnabled && (
              <div className="mt-4 w-64 rounded-xl border border-dashed border-zinc-700 p-4 text-center text-xs text-zinc-500">
                Ad placeholder - ads appear between matches on the free plan.
              </div>
            )}
          </div>
        )}

        <video
          ref={localVideoRef}
          autoPlay
          playsInline
          muted
          className="absolute bottom-4 right-4 h-40 w-28 rounded-xl object-cover border border-zinc-700 bg-zinc-900"
        />

        {state === 'in-call' && (
          <div className="absolute bottom-4 left-4 right-36 flex max-w-sm flex-col gap-2">
            <div className="flex max-h-40 flex-col gap-1 overflow-y-auto">
              {chat.slice(-8).map((m, i) => (
                <span
                  key={`${m.at}-${i}`}
                  className={`w-fit max-w-full break-words rounded-lg px-3 py-1.5 text-sm ${
                    m.mine ? 'self-end bg-emerald-600/80' : 'bg-zinc-900/80'
                  }`}
                >
                  {m.text}
                </span>
              ))}
            </div>
            <form onSubmit={sendChat} className="flex gap-2">
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                maxLength={500}
                placeholder="Write a message"
                aria-label="Chat message"
                className="min-w-0 flex-1 rounded-xl bg-zinc-900/90 border border-zinc-700 px-3 py-2 text-sm focus:outline-none focus:border-emerald-500"
              />
              <button className="rounded-xl bg-zinc-800 px-3 text-sm" disabled={!draft.trim()}>
                Send
              </button>
            </form>
          </div>
        )}

        {state === 'in-call' && (
          <div className="absolute top-4 left-4 right-4 flex items-center justify-between">
            <span className="flex items-center gap-2">
              <span className="rounded-lg bg-zinc-900/80 px-3 py-1.5 text-sm">
                {peer?.displayName ?? 'Stranger'}
                {peer?.country ? ` \u00b7 ${flagEmoji(peer.country)} ${peer.country}` : ''}
              </span>
              {!isDirect && !useAuth.getState().user?.isGuest && (
                <button
                  onClick={addFriend}
                  disabled={friendRequested}
                  className="rounded-lg bg-zinc-900/80 hover:bg-zinc-800 px-3 py-1.5 text-sm text-emerald-400 transition-colors disabled:text-zinc-500"
                >
                  {friendRequested ? 'Request sent' : '+ Add friend'}
                </button>
              )}
            </span>
            {secondsLeft !== null && (
              <span
                className={`rounded-lg bg-zinc-900/80 px-3 py-1.5 text-sm tabular-nums ${secondsLeft <= 60 ? 'text-amber-400' : 'text-zinc-300'}`}
                title="Free chat time left today"
              >
                {Math.floor(secondsLeft / 60)}:{String(secondsLeft % 60).padStart(2, '0')} left
              </span>
            )}
            {/* Report is pinned and always visible during a call */}
            <button
              onClick={() => setShowReport(true)}
              className="rounded-lg bg-red-500/90 hover:bg-red-400 px-3 py-1.5 text-sm font-semibold"
            >
              Report
            </button>
          </div>
        )}

        {limitMsg && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-4 bg-zinc-950/95 p-6 text-center">
            <h2 className="text-xl font-bold">Daily limit reached</h2>
            <p className="text-zinc-400">{limitMsg}</p>
            <button
              onClick={() => navigate('/upgrade')}
              className="rounded-xl bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-semibold px-6 py-3 transition-colors"
            >
              Go Premium
            </button>
            <button
              onClick={() => navigate('/home')}
              className="text-sm text-zinc-400 hover:text-zinc-200"
            >
              Back home
            </button>
          </div>
        )}
      </div>

      {/* Controls: Next is always reachable in random mode */}
      <div className="flex items-center justify-center gap-3 p-4">
        <button onClick={toggleMic} className={secondaryBtn}>
          {micOn ? 'Mute' : 'Unmute'}
        </button>
        <button onClick={toggleCam} className={secondaryBtn}>
          {camOn ? 'Cam off' : 'Cam on'}
        </button>
        {!isDirect && (
          <button
            onClick={skip}
            className="rounded-xl bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-semibold px-6 py-3 transition-colors"
          >
            Next <span className="hidden sm:inline text-xs opacity-60">(Esc)</span>
          </button>
        )}
        <button
          onClick={end}
          className="rounded-xl bg-red-500 hover:bg-red-400 font-semibold px-4 py-3 transition-colors"
        >
          End
        </button>
      </div>

      {showReport && (
        <div className="fixed inset-0 z-10 flex items-end sm:items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-zinc-900 border border-zinc-700 p-5 flex flex-col gap-2">
            <h2 className="text-lg font-bold mb-1">Report this person</h2>
            {REPORT_REASONS.map((reason) => (
              <button
                key={reason.code}
                onClick={() => report(reason.code)}
                className="rounded-xl border border-zinc-700 hover:border-red-400 px-4 py-3 text-left transition-colors"
              >
                {reason.label}
              </button>
            ))}
            <button
              onClick={() => setShowReport(false)}
              className="mt-1 text-sm text-zinc-400 hover:text-zinc-200"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
