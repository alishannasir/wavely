import type Redis from 'ioredis';

/** Redis pub/sub channel: the API instance holding a user's sockets disconnects them when told to. */
export const USER_KICK_CHANNEL = 'wavely:user-kick';

/**
 * Asks every API instance to drop a user's live sockets (which also ends their call and removes them from
 * the matching queue). Used when a user is suspended or banned. Best effort: the account status itself
 * is already saved, and find-match re-checks it, so a failure here must not fail the moderation action.
 */
export async function kickUser(redis: Redis, userId: string): Promise<void> {
  try {
    await redis.publish(USER_KICK_CHANNEL, userId);
  } catch {
    /* ignore: see above */
  }
}
