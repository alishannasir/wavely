import { useQuery } from '@tanstack/react-query';
import { API_BASE } from './api';

const MIN_TO_SHOW = 10; // a tiny number would look empty and put people off

/** "N people online", hidden until the number is worth showing. */
export function OnlineCount({ className = '' }: { className?: string }) {
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
  if (!data || data.online < MIN_TO_SHOW) return null;
  return (
    <p className={`flex items-center justify-center gap-2 text-sm text-zinc-400 ${className}`}>
      <span className="h-2 w-2 rounded-full bg-emerald-400" />
      {data.online.toLocaleString()} people online
    </p>
  );
}
