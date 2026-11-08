import { Transform } from 'class-transformer';

/** "  Bob@Example.COM " -> "bob@example.com". The same address must always be the same account. */
export function normalizeEmail<T>(value: T): T | string {
  return typeof value === 'string' ? value.trim().toLowerCase() : value;
}

/** Decorator for DTO email fields (the global ValidationPipe runs with transform: true). */
export const NormalizeEmail = () => Transform(({ value }) => normalizeEmail(value));
