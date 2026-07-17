import { useQuery } from '@tanstack/react-query';
import { api } from './api';

export interface BillingStatus {
  plan: 'TRIAL' | 'FREE' | 'MONTHLY' | 'ANNUAL';
  adsEnabled: boolean;
  filtersEnabled: boolean;
  dailyMinutes: number | null;
  dailyMatches: number | null;
  usage: { minutesUsed: number; matchesUsed: number };
  trialEndsAt: string;
}

export function useBillingStatus(enabled = true) {
  return useQuery({
    queryKey: ['billing-status'],
    queryFn: () => api<BillingStatus>('/billing/status'),
    enabled,
    staleTime: 30_000,
  });
}
