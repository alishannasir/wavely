import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getSocket } from './socket';

export interface IncomingCall {
  callId: string;
  from: { userId: string; displayName: string | null };
}

export function useIncomingCall() {
  const navigate = useNavigate();
  const [call, setCall] = useState<IncomingCall | null>(null);

  useEffect(() => {
    const socket = getSocket();
    const onIncoming = (payload: IncomingCall) => setCall(payload);
    // The caller hung up, someone else answered, or another tab took the call.
    const onCancelled = (payload: { callId?: string }) =>
      setCall((current) => (!payload?.callId || current?.callId === payload.callId ? null : current));
    socket.on('incoming-call', onIncoming);
    socket.on('call-cancelled', onCancelled);
    return () => {
      socket.off('incoming-call', onIncoming);
      socket.off('call-cancelled', onCancelled);
    };
  }, []);

  const accept = () => {
    if (!call) return;
    const { callId } = call;
    setCall(null);
    navigate(`/chat?accept=${callId}`);
  };

  const decline = () => {
    if (!call) return;
    getSocket().emit('decline-call', { callId: call.callId });
    setCall(null);
  };

  return { call, accept, decline };
}

export function IncomingCallBanner() {
  const { call, accept, decline } = useIncomingCall();
  if (!call) return null;
  return (
    <div
      role="alertdialog"
      aria-label="Incoming call"
      className="fixed bottom-4 left-4 right-4 z-40 mx-auto flex max-w-md items-center justify-between gap-3 rounded-2xl border border-line bg-white p-4 text-ink shadow-2xl"
    >
      <span className="text-sm">
        <strong>{call.from.displayName ?? 'A friend'}</strong> is calling…
      </span>
      <span className="flex gap-2">
        <button onClick={accept} className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white shadow-[0_3px_0_rgb(12_74_153)] hover:bg-accent-700">
          Accept
        </button>
        <button onClick={decline} className="rounded-lg bg-danger px-4 py-2 text-sm font-semibold text-white shadow-[0_3px_0_rgb(158_31_54)] hover:bg-danger-700">
          Decline
        </button>
      </span>
    </div>
  );
}
