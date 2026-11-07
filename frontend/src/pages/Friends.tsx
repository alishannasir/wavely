import { FormEvent, useEffect, useRef, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { getSocket } from '../lib/socket';
import { IncomingCallBanner } from '../lib/IncomingCall';
import { useAuth } from '../store/auth';
import AppShell from '../components/nav/AppShell';
import VerifyBanner from '../components/VerifyBanner';
import { Card } from '../components/ui/PageShell';
import ChunkyButton from '../components/ui/ChunkyButton';
import Modal from '../components/ui/Modal';
import FlagPill from '../components/ui/FlagPill';
import { inputCls } from '../lib/ui';

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
    <AppShell title="Friends">
      <div className="mx-auto flex max-w-xl flex-col gap-5">
        <h1 className="hidden font-display text-3xl font-semibold text-brand md:block">Friends</h1>
        <VerifyBanner />

        {requests && requests.length > 0 && (
          <section className="flex flex-col gap-2" aria-label="Friend requests">
            <h2 className="font-display text-lg text-muted">Friend requests</h2>
            {requests.map((request) => (
              <div key={request.id} className="flex items-center justify-between rounded-2xl bg-white p-3 shadow-sm">
                <span className="font-semibold">{request.from.displayName ?? 'Someone'}</span>
                <span className="flex gap-2">
                  <ChunkyButton size="sm" onClick={() => accept(request.id)}>Accept</ChunkyButton>
                  <ChunkyButton size="sm" variant="neutral" onClick={() => decline(request.id)}>Decline</ChunkyButton>
                </span>
              </div>
            ))}
          </section>
        )}

        <section className="flex flex-col gap-2" aria-label="Your friends">
          {friends && friends.length === 0 && (
            <p className="rounded-2xl bg-white p-5 text-center text-muted shadow-sm">
              No friends yet. Add people you meet in random chat!
            </p>
          )}
          {friends?.map((friend) => (
            <div key={friend.userId} className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-white p-3 shadow-sm">
              <span className="flex items-center gap-2">
                <span
                  className={`h-2.5 w-2.5 rounded-full ${friend.online ? 'bg-emerald-500' : 'bg-line'}`}
                  title={friend.online ? 'Online' : 'Offline'}
                />
                <span className="font-semibold">{friend.displayName ?? 'Friend'}</span>
                {friend.country && <FlagPill country={friend.country} />}
              </span>
              <span className="flex gap-2">
                <ChunkyButton size="sm" variant="neutral" onClick={() => setChatWith(friend)}>Chat</ChunkyButton>
                <ChunkyButton size="sm" onClick={() => navigate(`/chat?friend=${friend.userId}`)} disabled={!friend.online}>Call</ChunkyButton>
                <ChunkyButton size="sm" variant="neutral" onClick={() => remove(friend.userId)}>Remove</ChunkyButton>
              </span>
            </div>
          ))}
        </section>
      </div>

      <Modal open={Boolean(chatWith)} onClose={() => setChatWith(null)} labelledBy="dm-title" className="flex h-[70vh] max-w-md flex-col p-0">
        <h2 id="dm-title" className="border-b border-line p-4 pr-12 font-display text-xl font-semibold text-brand">
          {chatWith?.displayName ?? 'Friend'}
        </h2>
        <div className="flex flex-1 flex-col gap-2 overflow-y-auto p-4">
          {messages?.map((message) => (
            <div
              key={message.id}
              className={`max-w-[75%] rounded-2xl px-3 py-2 text-sm ${
                message.senderId === me?.id ? 'self-end rounded-br-sm bg-brand text-white' : 'self-start rounded-bl-sm bg-surface-2'
              }`}
            >
              {message.content}
            </div>
          ))}
          <div ref={bottomRef} />
        </div>
        <form onSubmit={send} className="flex gap-2 border-t border-line p-3">
          <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Message..." aria-label="Message" className={inputCls} />
          <ChunkyButton disabled={!draft.trim()}>Send</ChunkyButton>
        </form>
      </Modal>

      <IncomingCallBanner />
    </AppShell>
  );
}

export default function Friends() {
  const user = useAuth((s) => s.user);
  const isGuest = user?.isGuest;
  if (!user) return <Navigate to="/" replace />;
  if (isGuest) {
    return (
      <AppShell title="Friends">
        <Card className="mt-6 text-center">
          <h1 className="mb-2 font-display text-2xl font-semibold text-brand">Friends need an account</h1>
          <p className="mb-5 text-muted">Create a free account to add friends, message them and call them directly.</p>
          <ChunkyButton to="/signup">Create an account</ChunkyButton>
          <Link to="/chat" className="mt-4 block text-sm text-muted hover:text-ink">Back to chat</Link>
        </Card>
      </AppShell>
    );
  }
  return <FriendsInner />;
}
