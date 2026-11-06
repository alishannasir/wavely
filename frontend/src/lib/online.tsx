import { useQuery } from '@tanstack/react-query';
import { API_BASE } from './api';

const MIN_TO_SHOW = 10; // a tiny number would look empty and put people off

/** Live count of people online, or null until the number is worth showing. */
export function useOnlineCount(): number | null {
  const { data } = useQuery({
    queryKey: ['online-count'],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/stats/online`);
      if (!res.ok) throw new Error('stats failed');
      return (await res.json()) as { online: number };
    },
    refetchInterval: 15_000,
    retry: false,
  });
  return data && data.online >= MIN_TO_SHOW ? data.online : null;
}

/** "N users online" with a live dot. Renders nothing while the count is small. */
export function OnlineCount({ className = '', tone = 'light' }: { className?: string; tone?: 'light' | 'dark' }) {
  const online = useOnlineCount();
  if (online === null) return null;
  return (
    <p className={`flex items-center justify-center gap-2 text-sm font-semibold ${tone === 'dark' ? 'text-white' : 'text-muted'} ${className}`}>
      <span className="h-2.5 w-2.5 rounded-full bg-emerald-400 shadow-[0_0_0_3px_rgb(52_211_153/0.25)]" />
      {online.toLocaleString()} users online
    </p>
  );
}
