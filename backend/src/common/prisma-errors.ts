/** True for Prisma's "unique constraint failed" (P2002): two requests tried to claim the same value at once. */
export function isUniqueViolation(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: string }).code === 'P2002';
}
