export interface UserTimeLeft {
  userId: string;
  /** Milliseconds of chat time left today; null = no cap on this plan. */
  remainingMs: number | null;
}

/**
 * A call ends when the first participant runs out of free time, so its deadline is the smaller of
 * the two remaining times. Returns null if neither user is capped.
 */
export function computeCallDeadline(
  a: UserTimeLeft,
  b: UserTimeLeft,
  nowMs: number,
): { atMs: number; limitedUserId: string } | null {
  const capped = [a, b].filter((u): u is UserTimeLeft & { remainingMs: number } => u.remainingMs !== null);
  if (!capped.length) return null;
  const first = capped.reduce((x, y) => (y.remainingMs < x.remainingMs ? y : x));
  return { atMs: nowMs + first.remainingMs, limitedUserId: first.userId };
}
