import type Redis from 'ioredis';

const key = (jti: string) => `revoked:${jti}`;

/** Ends one login: the token stays invalid until it would have expired anyway. Tokens without an id cannot be revoked. */
export async function revokeSession(redis: Redis, payload: { jti?: string; exp?: number }): Promise<void> {
  if (!payload.jti || typeof payload.exp !== 'number') return;
  const secondsLeft = Math.ceil(payload.exp - Date.now() / 1000);
  if (secondsLeft > 0) await redis.set(key(payload.jti), '1', 'EX', secondsLeft);
}

export async function isSessionRevoked(redis: Redis, jti: string | undefined): Promise<boolean> {
  if (!jti) return false;
  try {
    return (await redis.exists(key(jti))) === 1;
  } catch {
    return false; // Redis down: do not lock everyone out
  }
}
