import { Injectable, Logger } from '@nestjs/common';
import { AccessToken, RoomServiceClient } from 'livekit-server-sdk';

export const MAX_CALL_SECONDS = 2 * 60 * 60;
const MIN_TOKEN_SECONDS = 60;

/** Token lifetime: the call's deadline (free-tier minutes left), never more than 2h, never under 60s. */
export function tokenTtlSeconds(deadlineMs: number | null): number {
  if (deadlineMs === null) return MAX_CALL_SECONDS;
  return Math.min(MAX_CALL_SECONDS, Math.max(MIN_TOKEN_SECONDS, Math.ceil(deadlineMs / 1000)));
}

@Injectable()
export class LivekitService {
  private readonly log = new Logger(LivekitService.name);

  get url(): string {
    return process.env.LIVEKIT_URL ?? '';
  }

  async createToken(
    roomName: string,
    identity: string,
    name?: string | null,
    ttlSeconds = MAX_CALL_SECONDS,
  ): Promise<string> {
    const at = new AccessToken(
      process.env.LIVEKIT_API_KEY ?? '',
      process.env.LIVEKIT_API_SECRET ?? '',
      { identity, name: name ?? undefined, ttl: ttlSeconds },
    );
    at.addGrant({ room: roomName, roomJoin: true, canPublish: true, canSubscribe: true });
    return at.toJwt();
  }

  /**
   * A LiveKit token only limits when someone can JOIN; a connected participant stays connected.
   * To really end a call at the free-tier limit the server removes the participants. Best effort.
   */
  async removeParticipants(roomName: string, identities: string[]): Promise<void> {
    if (!this.url) return;
    const host = this.url.replace(/^wss:/, 'https:').replace(/^ws:/, 'http:');
    const client = new RoomServiceClient(host, process.env.LIVEKIT_API_KEY ?? '', process.env.LIVEKIT_API_SECRET ?? '');
    await Promise.all(
      identities.map((id) =>
        client.removeParticipant(roomName, id).catch((err: Error) => this.log.warn(`removeParticipant ${id}: ${err.message}`)),
      ),
    );
  }
}
