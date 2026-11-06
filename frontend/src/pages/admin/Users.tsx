import { FormEvent, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Badge } from './AdminLayout';
import ChunkyButton from '../../components/ui/ChunkyButton';
import { adminApi, timeAgo } from '../../lib/admin';
import { inputCls } from '../../lib/ui';

export default function Users() {
  const [text, setText] = useState('');
  const [q, setQ] = useState('');
  const { data, isFetching, isError, error } = useQuery({ queryKey: ['admin-users', q], queryFn: () => adminApi.users(q), enabled: q.length > 0 });

  function submit(e: FormEvent) {
    e.preventDefault();
    setQ(text.trim());
  }

  return (
    <div className="flex flex-col gap-4">
      <h1 className="font-display text-2xl font-semibold">Find a user</h1>
      <form onSubmit={submit} className="flex gap-2">
        <input className={inputCls} placeholder="Email, name, user id, IP address or device id" aria-label="Search users" value={text} onChange={(e) => setText(e.target.value)} autoFocus />
        <ChunkyButton disabled={!text.trim()}>Search</ChunkyButton>
      </form>
      {isFetching && <p className="text-muted">Searching…</p>}
      {isError && <p role="alert" className="text-danger">{(error as Error).message}</p>}
      {data && data.length === 0 && <p className="rounded-2xl bg-white p-6 text-center text-muted">No users found.</p>}
      <ul className="flex flex-col gap-2">
        {data?.map((u) => (
          <li key={u.id}>
            <Link to={`/admin/users/${u.id}`} className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-2xl bg-white p-4 shadow-sm hover:shadow">
              <span className="min-w-[10rem] font-semibold">{u.displayName ?? '(no name)'}<span className="block text-xs font-normal text-muted">{u.email ?? 'guest'}</span></span>
              <span className="flex gap-1.5">
                {u.isGuest && <Badge>guest</Badge>}
                {u.role !== 'USER' && <Badge tone="brand">{u.role}</Badge>}
                {u.status !== 'ACTIVE' && <Badge tone="danger">{u.status.toLowerCase()}</Badge>}
              </span>
              <span className="ml-auto text-xs text-muted">joined {timeAgo(u.createdAt)}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
