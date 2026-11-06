import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import type { Room } from 'livekit-client';
import { getSocket } from '../lib/socket';
import { api } from '../lib/api';
import { useAuth } from '../store/auth';
import { useFilters } from '../store/filters';
import { useBillingStatus } from '../lib/billing';

interface MatchPayload {
  roomName: string;
  token: string;
  url: string;
  sessionId: string;
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

  const disconnectRoom = useCallback(async () => {
    await roomRef.current?.disconnect();
    roomRef.current = null;
  }, []);

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
      navigate('/login');
      return;
    }
    const socket = getSocket();

    const onMatch = async (payload: MatchPayload) => {
      sessionRef.current = payload;
      setPeer(payload.peer);
      setState('connecting');
      // LiveKit SDK is lazy-loaded only when a call actually starts.
      const { Room: LKRoom, RoomEvent, Track } = await import('livekit-client');
      const room = new LKRoom();
      roomRef.current = room;
      room.on(RoomEvent.TrackSubscribed, (track) => {
        if (track.kind === Track.Kind.Video && remoteVideoRef.current) {
          track.attach(remoteVideoRef.current);
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
      setNotice(payload?.message ?? 'Something went wrong.');
    };

    const onLimitReached = (payload: { message?: string }) => {
      setLimitMsg(payload?.message ?? 'You have reached your daily limit.');
    };

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
    socket.on('limit-reached', onLimitReached);
    socket.on('call-declined', onDeclined);
    socket.on('call-unavailable', onUnavailable);
    start();

    return () => {
      socket.off('match-found', onMatch);
      socket.off('call-started', onMatch);
      socket.off('peer-left', onPeerLeft);
      socket.off('match-error', onError);
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
        <video ref={remoteVideoRef} autoPlay playsInline className="h-full w-full object-cover" />

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
          <div className="absolute top-4 left-4 right-4 flex items-center justify-between">
            <span className="flex items-center gap-2">
              <span className="rounded-lg bg-zinc-900/80 px-3 py-1.5 text-sm">
                {peer?.displayName ?? 'Stranger'}
                {peer?.country ? ` \u00b7 ${peer.country}` : ''}
              </span>
              {!isDirect && (
                <button
                  onClick={addFriend}
                  disabled={friendRequested}
                  className="rounded-lg bg-zinc-900/80 hover:bg-zinc-800 px-3 py-1.5 text-sm text-emerald-400 transition-colors disabled:text-zinc-500"
                >
                  {friendRequested ? 'Request sent' : '+ Add friend'}
                </button>
              )}
            </span>
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

      {/* Controls: Skip is always reachable in random mode */}
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
            Skip
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
