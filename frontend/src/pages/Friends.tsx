import { FormEvent, useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { getSocket } from '../lib/socket';
import { IncomingCallBanner } from '../lib/IncomingCall';
import { useAuth } from '../store/auth';

interface Friend {
  userId: string;
  displayName: string | null;
  avatarUrl: string | null;
  country: string | null;
  online: boolean;
}

interface FriendRequest {
  id: string;
  createdAt: string;
  from: { userId: string; displayName: string | null; avatarUrl: string | null };
}

interface Message {
  id: string;
  senderId: string;
  receiverId: string;
  content: string;
  createdAt: string;
}

function FriendsInner() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const me = useAuth((s) => s.user);
  const [chatWith, setChatWith] = useState<Friend | null>(null);
  const [draft, setDraft] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);

  const { data: friends } = useQuery({
    queryKey: ['friends'],
    queryFn: () => api<Friend[]>('/friends'),
    refetchInterval: 30_000, // keep online dots fresh
  });
  const { data: requests } = useQuery({
    queryKey: ['friend-requests'],
    queryFn: () => api<FriendRequest[]>('/friends/requests'),
  });

  const { data: messages } = useQuery({
    queryKey: ['messages', chatWith?.userId],
    queryFn: () => api<Message[]>(`/messages/${chatWith!.userId}`),
    enabled: Boolean(chatWith),
  });

  useEffect(() => {
    const socket = getSocket();
    const append = (message: Message) => {
      const otherId = message.senderId === me?.id ? message.receiverId : message.senderId;
      queryClient.setQueryData<Message[]>(['messages', otherId], (old) =>
        old ? [...old, message] : [message],
      );
    };
    socket.on('new-message', append);
    socket.on('message-sent', append);
    return () => {
      socket.off('new-message', append);
      socket.off('message-sent', append);
    };
  }, [me?.id, queryClient]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function accept(id: string) {
    await api(`/friends/requests/${id}/accept`, { method: 'POST' });
    queryClient.invalidateQueries({ queryKey: ['friends'] });
    queryClient.invalidateQueries({ queryKey: ['friend-requests'] });
  }

  async function decline(id: string) {
    await api(`/friends/requests/${id}/decline`, { method: 'POST' });
    queryClient.invalidateQueries({ queryKey: ['friend-requests'] });
  }

  async function remove(userId: string) {
    await api(`/friends/${userId}`, { method: 'DELETE' });
    queryClient.invalidateQueries({ queryKey: ['friends'] });
    if (chatWith?.userId === userId) setChatWith(null);
  }

  function send(e: FormEvent) {
    e.preventDefault();
    const content = draft.trim();
    if (!content || !chatWith) return;
    getSocket().emit('send-message', { toUserId: chatWith.userId, content });
    setDraft('');
  }

  return (
    <main className="min-h-screen flex flex-col gap-6 p-6 max-w-md mx-auto">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Friends</h1>
        <Link to="/home" className="text-sm text-zinc-400 hover:text-zinc-200">
          Back home
        </Link>
      </header>

      {requests && requests.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold text-zinc-400">Friend requests</h2>
          {requests.map((request) => (
            <div
              key={request.id}
              className="flex items-center justify-between rounded-xl border border-zinc-800 bg-zinc-900/60 p-3"
            >
              <span>{request.from.displayName ?? 'Someone'}</span>
              <span className="flex gap-2">
                <button
                  onClick={() => accept(request.id)}
                  className="rounded-lg bg-emerald-500 hover:bg-emerald-400 text-zinc-950 px-3 py-1.5 text-sm font-semibold transition-colors"
                >
                  Accept
                </button>
                <button
                  onClick={() => decline(request.id)}
                  className="rounded-lg border border-zinc-700 hover:border-zinc-500 px-3 py-1.5 text-sm transition-colors"
                >
                  Decline
                </button>
              </span>
            </div>
          ))}
        </section>
      )}

      <section className="flex flex-col gap-2">
        {friends && friends.length === 0 && (
          <p className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4 text-sm text-zinc-400">
            No friends yet. Add people you meet in random chat!
          </p>
        )}
        {friends?.map((friend) => (
          <div
            key={friend.userId}
            className="flex items-center justify-between rounded-xl border border-zinc-800 bg-zinc-900/60 p-3"
          >
            <span className="flex items-center gap-2">
              <span
                className={`h-2.5 w-2.5 rounded-full ${friend.online ? 'bg-emerald-400' : 'bg-zinc-600'}`}
              />
              <span>{friend.displayName ?? 'Friend'}</span>
              {friend.country && <span className="text-xs text-zinc-500">{friend.country}</span>}
            </span>
            <span className="flex gap-2">
              <button
                onClick={() => setChatWith(friend)}
                className="rounded-lg border border-zinc-700 hover:border-zinc-500 px-3 py-1.5 text-sm transition-colors"
              >
                Chat
              </button>
              <button
                onClick={() => navigate(`/call?friend=${friend.userId}`)}
                disabled={!friend.online}
                className="rounded-lg bg-emerald-500 hover:bg-emerald-400 text-zinc-950 px-3 py-1.5 text-sm font-semibold transition-colors disabled:opacity-40"
              >
                Call
              </button>
              <button
                onClick={() => remove(friend.userId)}
                className="rounded-lg border border-zinc-700 hover:border-red-400 px-3 py-1.5 text-sm transition-colors"
              >
                Remove
              </button>
            </span>
          </div>
        ))}
      </section>

      {chatWith && (
        <div className="fixed inset-0 z-10 flex items-end justify-center bg-black/60">
          <div className="w-full max-w-md h-[70vh] rounded-t-2xl bg-zinc-900 border border-zinc-700 flex flex-col">
            <header className="flex items-center justify-between p-4 border-b border-zinc-800">
              <strong>{chatWith.displayName ?? 'Friend'}</strong>
              <button
                onClick={() => setChatWith(null)}
                className="text-sm text-zinc-400 hover:text-zinc-200"
              >
                Close
              </button>
            </header>
            <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-2">
              {messages?.map((message) => (
                <div
                  key={message.id}
                  className={`max-w-[75%] rounded-xl px-3 py-2 text-sm ${
                    message.senderId === me?.id
                      ? 'self-end bg-emerald-500 text-zinc-950'
                      : 'self-start bg-zinc-800'
                  }`}
                >
                  {message.content}
                </div>
              ))}
              <div ref={bottomRef} />
            </div>
            <form onSubmit={send} className="flex gap-2 p-4 border-t border-zinc-800">
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="Message..."
                className="flex-1 rounded-xl bg-zinc-950 border border-zinc-700 px-4 py-3 focus:outline-none focus:border-emerald-500"
              />
              <button className="rounded-xl bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-semibold px-5 transition-colors">
                Send
              </button>
            </form>
          </div>
        </div>
      )}

      <IncomingCallBanner />
    </main>
  );
}

export default function Friends() {
  const isGuest = useAuth((s) => s.user?.isGuest);
  if (isGuest) {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center gap-4 p-6 max-w-md mx-auto text-center">
        <h1 className="text-2xl font-bold">Friends need an account</h1>
        <p className="text-zinc-400">Create a free account to add friends, message them and call them directly.</p>
        <Link to="/signup" className="rounded-xl bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-semibold px-6 py-3">
          Create an account
        </Link>
        <Link to="/home" className="text-sm text-zinc-400">Back</Link>
      </main>
    );
  }
  return <FriendsInner />;
}
