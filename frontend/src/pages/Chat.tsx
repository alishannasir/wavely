import { ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import type { LocalAudioTrack, LocalVideoTrack, Room } from 'livekit-client';
import Logo from '../components/brand/Logo';
import BottomNav from '../components/nav/BottomNav';
import ChunkyButton from '../components/ui/ChunkyButton';
import FlagPill from '../components/ui/FlagPill';
import StaticNoise from '../components/ui/StaticNoise';
import VolumePill from '../components/ui/VolumePill';
import RulesModal from '../components/RulesModal';
import ChatPanel, { ChatMsg } from '../components/chat/ChatPanel';
import FloatingChat from '../components/chat/FloatingChat';
import { useIsDesktop } from '../lib/useIsDesktop';
import { BlockSheet, FiltersModal, GenderModal, LimitModal, ReportSheet, SettingsModal, genderEmoji } from '../components/chat/modals';
import { IncomingCallBanner } from '../lib/IncomingCall';
import { OnlineCount } from '../lib/online';
import { captureFrame } from '../lib/evidence';
import { flagEmoji } from '../lib/flag';
import { NsfwScanner, preloadNsfwModel } from '../lib/nsfw';
import { getSocket } from '../lib/socket';
import { api } from '../lib/api';
import { useBillingStatus } from '../lib/billing';
import { isSessionExpired, useAuth, User } from '../store/auth';
import { useDevices } from '../store/devices';
import { useFilters } from '../store/filters';

interface MatchPayload {
  roomName: string;
  token: string;
  url: string;
  sessionId: string;
  /** Seconds of free chat time left today (null = unlimited). The server ends the call at 0. */
  limitSeconds?: number | null;
  peer: { userId: string; displayName: string | null; country: string | null };
}

type Phase = 'idle' | 'searching' | 'connecting' | 'in-call';

class StaleMatch extends Error {}

interface LocalTracks {
  video: LocalVideoTrack;
  audio: LocalAudioTrack;
}

/** Omit that works on each member of a union (plain Omit would merge them). */
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

const RULES_BOT_TEXT =
  'By pressing “Start”, you agree to our rules. Rule violators will be banned. Please keep your face visible in the camera frame.';

function Icon({ path, label }: { path: string; label: string }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-label={label} role="img">
      <path d={path} />
    </svg>
  );
}
const MIC = 'M12 14a3 3 0 0 0 3-3V5a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.9V21h2v-3.1A7 7 0 0 0 19 11h-2z';
const CAM = 'M17 10.5V7a1 1 0 0 0-1-1H4a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-3.5l4 4v-11l-4 4z';
const GEAR = 'M19.4 13a7.7 7.7 0 0 0 0-2l2.1-1.6-2-3.5-2.5 1a7.4 7.4 0 0 0-1.7-1L15 3h-4l-.4 2.9a7.4 7.4 0 0 0-1.7 1l-2.5-1-2 3.5L6.6 11a7.7 7.7 0 0 0 0 2l-2.1 1.6 2 3.5 2.5-1a7.4 7.4 0 0 0 1.7 1L11 21h4l.4-2.9a7.4 7.4 0 0 0 1.7-1l2.5 1 2-3.5L19.4 13zM13 15.5a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7z';

/** A small see-through button for the strip over the videos. */
function GlassBtn({ tone = 'neutral', className = '', ...props }: { tone?: 'primary' | 'danger' | 'neutral' } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const colour =
    tone === 'primary' ? 'bg-brand/80 hover:bg-brand' : tone === 'danger' ? 'bg-red-500/60 hover:bg-red-500/80' : 'bg-white/15 hover:bg-white/30';
  return (
    <button
      type="button"
      {...props}
      className={`h-8 whitespace-nowrap rounded-full px-3 text-sm font-semibold text-white transition disabled:opacity-40 ${colour} ${className}`}
    />
  );
}

function RoundBtn({ onClick, on = true, children, label }: { onClick: () => void; on?: boolean; children: ReactNode; label: string }) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      aria-pressed={!on}
      className={`flex h-10 w-10 items-center justify-center rounded-full text-white backdrop-blur transition ${on ? 'bg-stage/60 hover:bg-stage/80' : 'bg-danger'}`}
    >
      {children}
    </button>
  );
}

export default function Chat() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const friendParam = params.get('friend');
  const acceptParam = params.get('accept');
  const isDirect = Boolean(friendParam || acceptParam);

  const user = useAuth((s) => s.user);
  const token = useAuth((s) => s.sessionExpiresAt); // changes whenever the login does
  const filters = useFilters();
  const { data: billing } = useBillingStatus(Boolean(token));

  const [phase, setPhaseState] = useState<Phase>('idle');
  const phaseRef = useRef<Phase>('idle');
  const go = useCallback((p: Phase) => {
    phaseRef.current = p;
    setPhaseState(p);
  }, []);

  const [peer, setPeer] = useState<MatchPayload['peer'] | null>(null);
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);
  const [blurred, setBlurred] = useState(false);
  const [volume, setVolume] = useState(1);
  const [friendRequested, setFriendRequested] = useState(false);
  const [limitMsg, setLimitMsg] = useState<string | null>(null);
  const [limitAt, setLimitAt] = useState<number | null>(null); // epoch ms when free time runs out
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [showReport, setShowReport] = useState(false);
  const [showBlock, setShowBlock] = useState(false);
  const [showRules, setShowRules] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [showGender, setShowGender] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  const msgId = useRef(0);
  const [messages, setMessages] = useState<ChatMsg[]>([{ id: 0, kind: 'bot', text: RULES_BOT_TEXT }]);
  const addMsg = useCallback((m: DistributiveOmit<ChatMsg, 'id'>) => {
    setMessages((list) => [...list, { ...m, id: ++msgId.current } as ChatMsg].slice(-60));
  }, []);

  const roomRef = useRef<Room | null>(null);
  const sessionRef = useRef<MatchPayload | null>(null);
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLDivElement>(null);
  const isDesktop = useIsDesktop();
  const stageRef = useRef<HTMLDivElement>(null); // the video area the floating chat lives in
  const tracksRef = useRef<LocalTracks | null>(null);
  const creatingRef = useRef<Promise<void> | null>(null);
  const lkRef = useRef<typeof import('livekit-client') | null>(null);
  const scannerRef = useRef<NsfwScanner | null>(null);
  const flaggedSessionRef = useRef<string | null>(null);
  const volumeRef = useRef(1);
  const skipRef = useRef<() => void>(() => {});
  const cidRef = useRef(0);
  const hiddenNoteRef = useRef(false);
  // Bumped whenever the current call ends or a new one starts, so a slow connection attempt for an
  // older match can tell it is stale and stop instead of overwriting the current state.
  const genRef = useRef(0);
  // False once this screen has been left: late results (a camera that finally opened) must not be kept.
  const aliveRef = useRef(true);
  // Timers that send the user elsewhere after a message; cleared when leaving so they cannot fire on another screen.
  const timersRef = useRef<number[]>([]);
  const later = useCallback((fn: () => void, ms: number) => {
    timersRef.current.push(window.setTimeout(fn, ms));
  }, []);
  const addingFriendRef = useRef(false);

  // ---- camera and microphone ----
  // The camera and microphone are opened ONCE and stay open between matches (they are published into each
  // new room and unpublished when it ends), so pressing Next never restarts the camera or flashes the light.
  const loadLivekit = useCallback(async () => (lkRef.current ??= await import('livekit-client')), []);

  /** Opens the camera + mic if they are not open yet, and shows the camera in my own panel. Throws on failure. */
  const openTracks = useCallback(async (): Promise<LocalTracks> => {
    if (!tracksRef.current) {
      creatingRef.current ??= (async () => {
        const lk = await loadLivekit();
        const { videoDeviceId, audioDeviceId } = useDevices.getState();
        const created = await lk.createLocalTracks({
          video: videoDeviceId ? { deviceId: videoDeviceId } : true,
          audio: audioDeviceId ? { deviceId: audioDeviceId } : true,
        });
        // The user may have left this screen while the permission prompt was open: do not keep the camera on.
        if (!aliveRef.current) {
          created.forEach((t) => t.stop());
          throw new DOMException('Closed', 'AbortError');
        }
        tracksRef.current = {
          video: created.find((t) => t.kind === 'video') as LocalVideoTrack,
          audio: created.find((t) => t.kind === 'audio') as LocalAudioTrack,
        };
      })().finally(() => {
        creatingRef.current = null;
      });
      await creatingRef.current;
    }
    const tracks = tracksRef.current!;
    if (localVideoRef.current) tracks.video.attach(localVideoRef.current);
    return tracks;
  }, [loadLivekit]);

  /** Closes the camera and microphone (leaving the screen, or after choosing other devices). */
  const releaseTracks = useCallback(() => {
    const t = tracksRef.current;
    tracksRef.current = null;
    t?.video.stop();
    t?.audio.stop();
  }, []);

  const startPreview = useCallback(async () => {
    setPreviewError(null);
    try {
      await openTracks();
    } catch (err) {
      const name = (err as DOMException).name;
      setPreviewError(
        name === 'NotAllowedError'
          ? 'Camera and microphone access is blocked. Allow it in your browser settings, then press Try again.'
          : name === 'NotFoundError'
            ? 'No camera or microphone found.'
            : 'Could not open your camera.',
      );
    }
  }, [openTracks]);

  const stopScanner = useCallback(() => {
    scannerRef.current?.stop();
    scannerRef.current = null;
    setBlurred(false);
  }, []);

  const disconnectRoom = useCallback(async () => {
    genRef.current++;
    stopScanner();
    const room = roomRef.current;
    roomRef.current = null;
    await room?.disconnect(false); // false = keep my camera and microphone open
    setMicOn(true);
    setCamOn(true);
  }, [stopScanner]);

  const start = useCallback(() => {
    go('searching');
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
  }, [friendParam, acceptParam, go]);

  useEffect(() => {
    aliveRef.current = true;
    if (isSessionExpired(token)) {
      useAuth.getState().logout(); // drop a saved but expired login
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

    const backToIdle = (text?: string) => {
      go('idle');
      setPeer(null);
      if (text) addMsg({ kind: 'bot', text });
      if (!isDirect) void startPreview();
    };

    const onMatch = async (payload: MatchPayload) => {
      const gen = ++genRef.current;
      const stale = () => gen !== genRef.current;
      // A new match replaces whatever room is still open. The camera stays on: only the room goes.
      stopScanner();
      const previous = roomRef.current;
      roomRef.current = null;
      void previous?.disconnect(false);

      sessionRef.current = payload;
      hiddenNoteRef.current = false;
      setLimitAt(typeof payload.limitSeconds === 'number' ? Date.now() + payload.limitSeconds * 1000 : null);
      setMessages([{ id: ++msgId.current, kind: 'bot', country: payload.peer.country }]);
      setPeer(payload.peer);
      go('connecting');

      let room: Room | null = null;
      try {
        // LiveKit SDK is lazy-loaded only when a call actually starts.
        const { Room: LKRoom, RoomEvent, Track } = await loadLivekit();
        if (stale()) return;
        const { videoDeviceId, audioDeviceId } = useDevices.getState();
        room = new LKRoom({
          ...(videoDeviceId ? { videoCaptureDefaults: { deviceId: videoDeviceId } } : {}),
          ...(audioDeviceId ? { audioCaptureDefaults: { deviceId: audioDeviceId } } : {}),
        });
        roomRef.current = room;
        room.on(RoomEvent.TrackSubscribed, (track) => {
          if (stale()) return;
          if (track.kind === Track.Kind.Video && remoteVideoRef.current) {
            track.attach(remoteVideoRef.current);
            startScanner();
          } else if (track.kind === Track.Kind.Audio && audioRef.current) {
            const el = track.attach();
            el.volume = volumeRef.current;
            audioRef.current.appendChild(el);
          }
        });
        await room.connect(payload.url, payload.token);
        if (stale()) throw new StaleMatch();
        const tracks = await openTracks(); // already open after the preview; opens them for friend calls
        if (stale()) throw new StaleMatch();
        await Promise.all([tracks.video.unmute(), tracks.audio.unmute()]);
        await room.localParticipant.publishTrack(tracks.video);
        await room.localParticipant.publishTrack(tracks.audio);
        if (stale()) throw new StaleMatch();
        setMicOn(true);
        setCamOn(true);
        go('in-call');
      } catch (err) {
        // The match was superseded (peer left, skipped, new match): just release the half-open room.
        if (err instanceof StaleMatch || stale()) {
          if (roomRef.current !== room) void room?.disconnect(false);
          return;
        }
        // Real failure (camera/mic denied, LiveKit unreachable): don't leave the other person hanging.
        const name = (err as DOMException)?.name;
        socket.emit('leave');
        await disconnectRoom();
        const text =
          name === 'NotAllowedError'
            ? 'Camera or microphone access was blocked. Check your browser permissions.'
            : name === 'NotFoundError'
              ? 'No camera or microphone found.'
              : 'Could not connect to the call. Please try again.';
        if (isDirect) {
          addMsg({ kind: 'bot', text });
          later(() => navigate('/friends'), 2500);
        } else {
          backToIdle(text);
        }
      }
    };

    const onPeerLeft = async () => {
      await disconnectRoom();
      if (isDirect) {
        navigate('/friends');
        return;
      }
      setMessages([{ id: ++msgId.current, kind: 'bot', text: 'Stranger left. Finding someone new…' }]);
      start();
      void startPreview();
    };

    const onError = (payload: { code?: string; message?: string }) => {
      if (payload?.code === 'AGE_REQUIRED') {
        navigate('/onboarding');
      } else if (payload?.code === 'RULES_REQUIRED') {
        backToIdle();
        setShowRules(true);
      } else if (payload?.code === 'REGION_BLOCKED') {
        navigate('/unavailable');
      } else if (payload?.code === 'BANNED') {
        useAuth.getState().logout();
        navigate('/');
      } else {
        addMsg({ kind: 'bot', text: payload?.message ?? 'Something went wrong.' });
      }
    };

    const onLimitReached = (payload: { message?: string }) => {
      void disconnectRoom(); // the server already ended the call; leave the room and show the upgrade prompt
      setLimitAt(null);
      setLimitMsg(payload?.message ?? 'You have reached your daily limit.');
      if (isDirect) navigate('/friends');
      else backToIdle();
    };

    const onChat = (msg: { text: string }) => addMsg({ kind: 'peer', text: msg.text });

    // The server hid something in what I sent (swear words, links, contact details): show what they see.
    const onChatAck = (ack: { cid?: number; text: string; links?: boolean }) => {
      setMessages((list) => list.map((m) => (m.kind === 'me' && m.cid === ack.cid ? { ...m, text: ack.text } : m)));
      if (!hiddenNoteRef.current) {
        hiddenNoteRef.current = true;
        addMsg({ kind: 'bot', text: ack.links ? 'Links and contact details are hidden in chat for guests and unconfirmed accounts. Offensive words are hidden for everyone.' : 'Offensive words are hidden in chat.' });
      }
    };
    const onChatWarning = (w: { message: string }) => addMsg({ kind: 'bot', text: w.message });

    // The server refuses the connection with a reason (see the gateway's auth middleware).
    const onConnectError = (err: Error) => {
      if (err.message === 'UNAUTHORIZED' || err.message === 'BANNED') {
        // Expired/invalid session (guest tokens last 4h) or a banned account.
        useAuth.getState().logout();
        navigate('/');
      } else if (err.message === 'REGION_BLOCKED') {
        navigate('/unavailable');
      }
      // SERVER_ERROR and network errors are retried by lib/socket.ts / Socket.IO; we keep waiting.
    };

    const onReplaced = () => {
      // Another tab/device started a call or search for this account.
      void disconnectRoom();
      if (isDirect) navigate('/friends');
      else backToIdle('This account started a chat in another tab.');
    };

    const onRelaxed = () => addMsg({ kind: 'bot', text: 'Still searching — widening your filters…' });

    const onDeclined = () => {
      addMsg({ kind: 'bot', text: 'Your friend declined the call.' });
      later(() => navigate('/friends'), 1500);
    };

    const onUnavailable = (payload: { message?: string }) => {
      addMsg({ kind: 'bot', text: payload?.message ?? 'Call unavailable.' });
      later(() => navigate('/friends'), 1500);
    };

    socket.on('match-found', onMatch);
    socket.on('call-started', onMatch);
    socket.on('peer-left', onPeerLeft);
    socket.on('match-error', onError);
    socket.on('call-chat', onChat);
    socket.on('call-chat-ack', onChatAck);
    socket.on('chat-warning', onChatWarning);
    socket.on('connect_error', onConnectError);
    socket.on('session-replaced', onReplaced);
    socket.on('filters-relaxed', onRelaxed);
    socket.on('limit-reached', onLimitReached);
    socket.on('call-declined', onDeclined);
    socket.on('call-unavailable', onUnavailable);
    // A socket that already failed earlier (e.g. opened on another page) will not report again unless retried.
    if (!socket.connected && !socket.active) socket.connect();

    if (isDirect) {
      start(); // friend calls ring straight away
    } else {
      go('idle');
      void startPreview();
      preloadNsfwModel();
    }

    return () => {
      socket.off('match-found', onMatch);
      socket.off('call-started', onMatch);
      socket.off('peer-left', onPeerLeft);
      socket.off('match-error', onError);
      socket.off('call-chat', onChat);
      socket.off('call-chat-ack', onChatAck);
      socket.off('chat-warning', onChatWarning);
      socket.off('connect_error', onConnectError);
      socket.off('session-replaced', onReplaced);
      socket.off('filters-relaxed', onRelaxed);
      socket.off('limit-reached', onLimitReached);
      socket.off('call-declined', onDeclined);
      socket.off('call-unavailable', onUnavailable);
      socket.emit('leave');
      aliveRef.current = false;
      timersRef.current.forEach((t) => window.clearTimeout(t));
      timersRef.current = [];
      void disconnectRoom();
      releaseTracks();
    };
  }, [token, navigate, later, start, disconnectRoom, isDirect, go, addMsg, startPreview, releaseTracks, stopScanner, loadLivekit, openTracks]);

  // ---- actions ----
  async function toggleMic() {
    const t = tracksRef.current;
    if (!t) return;
    if (micOn) await t.audio.mute();
    else await t.audio.unmute();
    setMicOn(!micOn);
  }

  async function toggleCam() {
    const t = tracksRef.current;
    if (!t) return;
    if (camOn) await t.video.mute();
    else await t.video.unmute();
    setCamOn(!camOn);
  }

  /** Start button: needs the rules accepted first (guests accepted them when their session was created). */
  function begin() {
    if (!user?.rulesAcceptedAt) {
      setShowRules(true);
      return;
    }
    start();
  }

  async function next() {
    getSocket().emit('leave');
    await disconnectRoom();
    setMessages([]); // a new person starts with a clean chat
    start();
    void startPreview();
  }
  skipRef.current = () => void next();

  /** Stop: leave the chat and go back to the idle screen (friend calls return to the friends list). */
  async function stop() {
    getSocket().emit('leave');
    await disconnectRoom();
    if (isDirect) {
      navigate('/friends');
      return;
    }
    go('idle');
    setPeer(null);
    setMessages([{ id: ++msgId.current, kind: 'bot', text: RULES_BOT_TEXT }]);
    void startPreview();
  }

  function sendChat(text: string) {
    if (phaseRef.current !== 'in-call') return;
    const cid = ++cidRef.current;
    getSocket().emit('call-chat', { text, cid });
    addMsg({ kind: 'me', text, cid });
  }

  async function addFriend() {
    const session = sessionRef.current;
    if (!session || friendRequested || addingFriendRef.current) return;
    addingFriendRef.current = true; // a fast double click must not send two requests
    try {
      await api('/friends/requests', { method: 'POST', body: JSON.stringify({ userId: session.peer.userId }) });
      setFriendRequested(true);
      addMsg({ kind: 'bot', text: 'Friend request sent.' });
    } catch (err) {
      addMsg({ kind: 'bot', text: (err as Error).message });
    } finally {
      addingFriendRef.current = false;
    }
  }

  /** Block the person you are talking to, then move on. */
  async function blockPeer() {
    const session = sessionRef.current;
    setShowBlock(false);
    if (!session) return;
    try {
      await api('/blocks', { method: 'POST', body: JSON.stringify({ userId: session.peer.userId }) });
      addMsg({ kind: 'bot', text: 'Blocked. You will not be matched with this person again.' });
    } catch (err) {
      addMsg({ kind: 'bot', text: (err as Error).message });
    }
    if (isDirect) await stop();
    else await next();
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
      addMsg({ kind: 'bot', text: 'Report submitted. Thank you.' });
    } catch {
      addMsg({ kind: 'bot', text: 'Could not submit report.' });
    }
    if (isDirect) await stop();
    else await next();
  }

  // Volume applies to the (hidden) audio elements LiveKit creates for the stranger.
  useEffect(() => {
    volumeRef.current = volume;
    audioRef.current?.querySelectorAll('audio').forEach((a) => (a.volume = volume));
  }, [volume]);

  // Countdown of free chat time during a call (the server enforces the real limit).
  useEffect(() => {
    if (limitAt === null || phase !== 'in-call') {
      setSecondsLeft(null);
      return;
    }
    const tick = () => setSecondsLeft(Math.max(0, Math.round((limitAt - Date.now()) / 1000)));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [limitAt, phase]);

  // Esc = Next (random mode). It does nothing while a dialog is open or while typing (it just leaves the box).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      const el = document.activeElement as HTMLElement | null;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT')) {
        el.blur();
        return;
      }
      if (document.querySelector('[aria-modal="true"]')) return;
      if (!isDirect && phaseRef.current === 'in-call') skipRef.current();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isDirect]);

  if (!user) return <Navigate to="/" replace />;

  const inCall = phase === 'in-call';
  const busy = phase !== 'idle';
  const filtersEnabled = Boolean(billing?.filtersEnabled) && !user.isGuest;
  const trialDaysLeft = Math.max(0, Math.ceil((new Date(user.trialEndsAt).getTime() - Date.now()) / 86_400_000));
  const capped = billing && (billing.dailyMinutes !== null || billing.dailyMatches !== null);
  const planNote =
    phase === 'idle' && !user.isGuest && billing ? (
      <>
        {trialDaysLeft > 0 && <span className="block">🎁 Free trial: <strong>{trialDaysLeft} day{trialDaysLeft === 1 ? '' : 's'}</strong> of full access left.</span>}
        {capped && (
          <span className="block">
            Today: {billing.dailyMinutes !== null && `${billing.usage.minutesUsed}/${billing.dailyMinutes} min`}
            {billing.dailyMinutes !== null && billing.dailyMatches !== null && ' · '}
            {billing.dailyMatches !== null && `${billing.usage.matchesUsed}/${billing.dailyMatches} chats`}.{' '}
            <Link to="/upgrade" className="font-semibold text-accent underline">Go Premium</Link>
          </span>
        )}
      </>
    ) : phase === 'idle' && user.isGuest ? (
      <span>
        You're chatting as a guest. <Link to="/signup" className="font-semibold text-accent underline">Create a free account</Link> to add friends and use filters.
      </span>
    ) : null;
  const countryBtn = filters.preferredCountry ? flagEmoji(filters.preferredCountry) : '🌐';

  const chatNote = planNote && (trialDaysLeft > 0 || capped || user.isGuest) ? planNote : null;

  return (
    <div className={`flex h-[100dvh] flex-col bg-page ${phase === 'idle' ? '' : 'pb-safe'}`}>
      <div ref={audioRef} className="hidden" />

      <header className="pt-safe flex w-full items-center justify-between px-3 py-1.5 md:px-4">
        <Link to="/" aria-label="Home">
          <Logo size={30} />
        </Link>
        <nav className="flex items-center gap-4 font-display text-base">
          {/* On phones these live in the bottom tab bar. */}
          <span className="hidden items-center gap-5 md:flex">
            {user.isGuest ? (
              <Link to="/signup" className="text-brand hover:underline">Sign up</Link>
            ) : (
              <Link to="/friends" className="text-brand hover:underline">Friends</Link>
            )}
            <Link to="/upgrade" className="text-brand hover:underline">Premium</Link>
            <Link to="/me" className="text-brand hover:underline">Profile</Link>
          </span>
          <button onClick={() => setShowSettings(true)} aria-label="Settings" className="rounded-full p-1.5 text-muted hover:bg-white">
            <Icon path={GEAR} label="Settings" />
          </button>
        </nav>
      </header>

      <main className="flex min-h-0 w-full flex-1 flex-col px-1 pb-1 md:px-2 md:pb-2">
        {/* Videos: stranger on the left, you on the right (desktop); you become a small picture-in-picture on phones. */}
        <div ref={stageRef} className="relative grid min-h-0 flex-1 grid-rows-2 gap-0.5 overflow-hidden rounded-2xl bg-stage md:grid-cols-2 md:grid-rows-1 md:gap-0">
          <div className="group relative min-h-0 overflow-hidden">
            <video
              ref={remoteVideoRef}
              autoPlay
              playsInline
              className={`absolute inset-0 h-full w-full object-cover transition-[filter] ${inCall ? '' : 'invisible'} ${blurred ? 'blur-3xl' : ''}`}
            />

            {!inCall && (
              <div className="absolute inset-0">
                <StaticNoise />
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-4 text-center text-white">
                  {phase === 'idle' ? (
                    <>
                      <div className="rounded-3xl bg-white/95 p-4 shadow-lg">
                        <Logo size={44} />
                      </div>
                      <OnlineCount tone="dark" />
                    </>
                  ) : (
                    <>
                      <div className="h-10 w-10 animate-spin rounded-full border-4 border-white border-t-transparent" />
                      <p className="font-display text-xl">
                        {phase === 'connecting' ? 'Connecting…' : isDirect ? 'Calling…' : 'Looking for someone…'}
                      </p>
                      {!isDirect && billing?.adsEnabled && phase === 'searching' && (
                        <div className="mt-2 w-60 rounded-xl border border-dashed border-white/40 p-3 text-xs text-white/70">
                          Ad placeholder — ads appear between matches on the free plan.
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            )}

            {inCall && (
              <>
                <div className="pointer-events-none absolute left-3 top-3 opacity-80">
                  <Logo size={26} variant="mono" />
                </div>
                <div className="absolute right-3 top-3 z-10 flex items-center gap-2">
                  {secondsLeft !== null && (
                    <span
                      title="Free chat time left today"
                      className={`rounded-full bg-stage/70 px-3 py-1.5 text-sm font-semibold tabular-nums backdrop-blur ${secondsLeft <= 60 ? 'text-amber-300' : 'text-white'}`}
                    >
                      {Math.floor(secondsLeft / 60)}:{String(secondsLeft % 60).padStart(2, '0')} left
                    </span>
                  )}
                  <button
                    onClick={() => setShowBlock(true)}
                    className="rounded-full bg-stage/70 px-3 py-1.5 text-sm font-semibold text-white backdrop-blur hover:bg-stage/90"
                  >
                    Block
                  </button>
                  {!isDirect && !user.isGuest && (
                    <button
                      onClick={addFriend}
                      disabled={friendRequested}
                      className="rounded-full bg-stage/70 px-3 py-1.5 text-sm font-semibold text-white backdrop-blur hover:bg-stage/90 disabled:opacity-60"
                    >
                      {friendRequested ? 'Request sent' : '+ Add friend'}
                    </button>
                  )}
                </div>
                <div className="absolute inset-x-0 top-1/2 z-10 flex -translate-y-1/2 justify-center">
                  <button
                    onClick={() => setShowReport(true)}
                    className="rounded-2xl bg-white/25 px-6 py-3 font-display text-xl font-semibold text-white backdrop-blur transition hover:bg-danger md:opacity-0 md:group-hover:opacity-100 md:focus-visible:opacity-100"
                  >
                    ⚑ Report
                  </button>
                </div>
                <div className="absolute bottom-3 left-3 z-10">
                  <VolumePill value={volume} onChange={setVolume} />
                </div>
                <div className="absolute bottom-3 right-3 z-10 flex items-center gap-2 text-sm font-semibold text-white">
                  {peer?.displayName && <span className="rounded-full bg-stage/70 px-3 py-1 backdrop-blur">{peer.displayName}</span>}
                  <FlagPill country={peer?.country} className="bg-stage/70 text-white backdrop-blur" />
                </div>
              </>
            )}

            {/* The NSFW overlay sits above everything else on the stranger's panel. */}
            {blurred && (
              <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 bg-stage/50 p-6 text-center text-white">
                <p className="font-display text-xl font-semibold">Video hidden: possible explicit content</p>
                <p className="text-sm text-white/80">It was sent to our moderators. You can go to the next person or show it anyway.</p>
                <span className="flex gap-3">
                  <ChunkyButton size="sm" onClick={() => (isDirect ? void stop() : void next())}>
                    {isDirect ? 'End call' : 'Next'}
                  </ChunkyButton>
                  <ChunkyButton size="sm" variant="neutral" onClick={() => setBlurred(false)}>
                    Show anyway
                  </ChunkyButton>
                </span>
              </div>
            )}
          </div>

          <div className="relative min-h-0 overflow-hidden bg-stage">
            <video ref={localVideoRef} autoPlay playsInline muted className="h-full w-full -scale-x-100 object-cover" />
            {previewError && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-stage/90 p-4 text-center text-sm text-white">
                <p>{previewError}</p>
                <ChunkyButton size="sm" onClick={() => void startPreview()}>Try again</ChunkyButton>
              </div>
            )}
            {inCall && (
              <div className="absolute left-2 top-2 flex gap-2 md:bottom-2 md:top-auto">
                <RoundBtn onClick={toggleMic} on={micOn} label={micOn ? 'Mute microphone' : 'Unmute microphone'}>
                  <Icon path={MIC} label="Microphone" />
                </RoundBtn>
                <RoundBtn onClick={toggleCam} on={camOn} label={camOn ? 'Turn camera off' : 'Turn camera on'}>
                  <Icon path={CAM} label="Camera" />
                </RoundBtn>
              </div>
            )}
          </div>

          {/* Small, see-through controls in the middle: at the bottom of your own video on a phone, at the top of the videos on desktop. */}
          <div className="pointer-events-none absolute inset-x-0 bottom-2 z-30 flex justify-center md:bottom-auto md:top-2">
            <div className="pointer-events-auto flex items-center gap-1 rounded-full border border-white/25 bg-black/25 p-1 backdrop-blur-md">
              {isDirect ? (
                <GlassBtn tone="danger" onClick={() => void stop()}>End call</GlassBtn>
              ) : (
                <>
                  <GlassBtn
                    tone="primary"
                    onClick={phase === 'idle' ? begin : () => void next()}
                    disabled={phase === 'connecting'}
                    title={phase === 'idle' ? 'Start' : 'Next (Esc)'}
                  >
                    {phase === 'idle' ? 'Start' : 'Next'}
                  </GlassBtn>
                  <GlassBtn tone="danger" onClick={() => void stop()} disabled={!busy}>Stop</GlassBtn>
                  <GlassBtn onClick={() => setShowFilters(true)} title="Country" aria-label="Country filter">
                    <span aria-hidden>{countryBtn}</span> <span className="hidden sm:inline">Country</span>
                  </GlassBtn>
                  <GlassBtn onClick={() => setShowGender(true)} title="I am" aria-label="I am">
                    <span aria-hidden>{genderEmoji(user.gender)}</span> <span className="hidden sm:inline">I am</span>
                  </GlassBtn>
                </>
              )}
            </div>
          </div>

          {/* Desktop: the chat is a small bar on the edge of the videos (click to open, drag to move, drag a corner to resize). */}
          {isDesktop && (
            <FloatingChat containerRef={stageRef} messageCount={messages.length}>
              <ChatPanel
                variant="floating"
                messages={messages}
                canSend={inCall}
                onSend={sendChat}
                onReport={inCall ? () => setShowReport(true) : undefined}
                note={chatNote}
                className="h-full"
              />
            </FloatingChat>
          )}
        </div>

        {/* Phone: the chat sits below both videos, solid and always in view, so nothing needs scrolling. */}
        {!isDesktop && (
          <ChatPanel
            messages={messages}
            canSend={inCall}
            onSend={sendChat}
            onReport={inCall ? () => setShowReport(true) : undefined}
            note={chatNote}
            className="mt-1 h-[30dvh] shrink-0"
          />
        )}
      </main>

      <BlockSheet open={showBlock} name={peer?.displayName ?? 'this person'} onClose={() => setShowBlock(false)} onConfirm={() => void blockPeer()} />
      <ReportSheet open={showReport} onClose={() => setShowReport(false)} onPick={(code) => void report(code)} />
      <FiltersModal open={showFilters} onClose={() => setShowFilters(false)} filtersEnabled={filtersEnabled} />
      <GenderModal open={showGender} onClose={() => setShowGender(false)} />
      <SettingsModal
        open={showSettings}
        onClose={() => setShowSettings(false)}
        onDevicesChanged={() => {
          // New devices apply when the camera is reopened: only possible between calls.
          if (phaseRef.current === 'idle' || phaseRef.current === 'searching') {
            releaseTracks();
            void startPreview();
          }
        }}
      />
      <LimitModal open={limitMsg !== null} message={limitMsg} onClose={() => setLimitMsg(null)} />
      {showRules && (
        <RulesModal
          onCancel={() => setShowRules(false)}
          onAccept={async () => {
            const updated = await api<User>('/users/me/accept-rules', { method: 'POST' });
            useAuth.getState().setUser(updated);
            setShowRules(false);
            start();
          }}
        />
      )}
      <IncomingCallBanner />
      {/* App-style tabs on phones; hidden during a search or call so the video gets the space. */}
      {phase === 'idle' && <BottomNav />}
    </div>
  );
}
