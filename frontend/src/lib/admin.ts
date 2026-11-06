import { api } from './api';

export type ReportStatus = 'OPEN' | 'REVIEWING' | 'RESOLVED';
export type Reason = 'NUDITY' | 'HARASSMENT' | 'MINOR_CONCERN' | 'SPAM' | 'OTHER';

export const REASON_LABEL: Record<Reason, string> = {
  NUDITY: 'Nudity / sexual',
  HARASSMENT: 'Harassment',
  MINOR_CONCERN: 'Possible minor',
  SPAM: 'Spam',
  OTHER: 'Other',
};

export interface QueueItem {
  id: string;
  reasonCode: Reason;
  status: ReportStatus;
  createdAt: string;
  source: 'USER' | 'AUTO_NSFW';
  nsfwScore: number | null;
  legalHold: boolean;
  evidenceExpiresAt: string | null;
  reported: { id: string; displayName: string | null; status: string; country: string | null; flaggedUntil: string | null };
  reporter: { id: string; displayName: string | null; createdAt: string };
}

export interface AuditEntry {
  id: string;
  action: string;
  actorId: string;
  actor: { id: string; displayName: string | null; email: string | null } | null;
  targetUserId: string | null;
  reportId: string | null;
  meta: Record<string, unknown> | null;
  createdAt: string;
}

export interface ReportDetailData extends Omit<QueueItem, 'reported'> {
  sessionId: string | null;
  resolution: string | null;
  reviewedAt: string | null;
  evidenceImage: string | null;
  chatLog: { from: 'reporter' | 'reported'; text: string; at: number }[] | null;
  escalatedAt: string | null;
  escalationNote: string | null;
  reported: QueueItem['reported'] & { createdAt: string; isGuest: boolean };
  reportedUserReportCounts: { status: ReportStatus; count: number }[];
  audit: AuditEntry[];
}

export interface AdminUser {
  id: string;
  email: string | null;
  displayName: string | null;
  status: 'ACTIVE' | 'SUSPENDED' | 'BANNED';
  role: 'USER' | 'MODERATOR' | 'ADMIN';
  isGuest: boolean;
  country: string | null;
  gender: string | null;
  createdAt: string;
  flaggedUntil: string | null;
  lastIp: string | null;
  lastDeviceId: string | null;
}

export interface UserDetailData {
  user: AdminUser;
  reportsReceived: { status: ReportStatus; count: number }[];
  reportsMade: number;
  recentReports: { id: string; reasonCode: Reason; status: ReportStatus; source: string; createdAt: string; legalHold: boolean; resolution: string | null }[];
  bans: { id: string; type: 'IP' | 'DEVICE'; value: string; reason: string | null; expiresAt: string | null }[];
  audit: AuditEntry[];
}

const qs = (o: Record<string, string | number | undefined | null>) => {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(o)) if (v !== undefined && v !== null && v !== '') p.set(k, String(v));
  const s = p.toString();
  return s ? `?${s}` : '';
};

export const adminApi = {
  counts: () => api<{ open: number; reviewing: number; legalHold: number; openMinorConcern: number }>('/admin/reports/counts'),
  reports: (f: { status?: ReportStatus; reason?: string; source?: string; hold?: boolean; skip?: number; take?: number }) =>
    api<{ total: number; items: QueueItem[] }>(`/admin/reports${qs({ ...f, hold: f.hold ? 'true' : undefined })}`),
  report: (id: string) => api<ReportDetailData>(`/admin/reports/${id}`),
  resolve: (id: string, action: 'DISMISS' | 'SUSPEND' | 'BAN' | 'RESTORE') =>
    api(`/admin/reports/${id}/resolve`, { method: 'POST', body: JSON.stringify({ action }) }),
  escalate: (id: string, note?: string) => api(`/admin/reports/${id}/escalate`, { method: 'POST', body: JSON.stringify({ note }) }),
  releaseHold: (id: string) => api(`/admin/reports/${id}/release-hold`, { method: 'POST' }),
  users: (q: string) => api<AdminUser[]>(`/admin/users${qs({ q })}`),
  user: (id: string) => api<UserDetailData>(`/admin/users/${id}`),
  setStatus: (id: string, action: 'SUSPEND' | 'BAN' | 'RESTORE', note?: string) =>
    api(`/admin/users/${id}/status`, { method: 'POST', body: JSON.stringify({ action, note }) }),
  setRole: (id: string, role: 'USER' | 'MODERATOR' | 'ADMIN') => api(`/admin/users/${id}/role`, { method: 'POST', body: JSON.stringify({ role }) }),
  audit: (f: { action?: string; skip?: number; take?: number }) => api<{ total: number; items: AuditEntry[] }>(`/admin/audit${qs(f)}`),
};

export function timeAgo(iso: string): string {
  const s = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return `${Math.floor(s / 86400)} d ago`;
}

export function daysUntil(iso: string | null): number | null {
  return iso ? Math.max(0, Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000)) : null;
}
