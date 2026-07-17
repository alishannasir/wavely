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
    socket.on('incoming-call', onIncoming);
    return () => {
      socket.off('incoming-call', onIncoming);
    };
  }, []);

  const accept = () => {
    if (!call) return;
    const { callId } = call;
    setCall(null);
    navigate(`/call?accept=${callId}`);
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
    <div className="fixed bottom-4 left-4 right-4 z-20 mx-auto max-w-md rounded-2xl border border-emerald-500/40 bg-zinc-900 p-4 flex items-center justify-between gap-3 shadow-xl">
      <span className="text-sm">
        <strong>{call.from.displayName ?? 'A friend'}</strong> is calling...
      </span>
      <span className="flex gap-2">
        <button
          onClick={accept}
          className="rounded-lg bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-semibold px-4 py-2 text-sm transition-colors"
        >
          Accept
        </button>
        <button
          onClick={decline}
          className="rounded-lg bg-red-500 hover:bg-red-400 px-4 py-2 text-sm font-semibold transition-colors"
        >
          Decline
        </button>
      </span>
    </div>
  );
}
