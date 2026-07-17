import { Injectable } from '@nestjs/common';
import { AccessToken } from 'livekit-server-sdk';

@Injectable()
export class LivekitService {
  get url(): string {
    return process.env.LIVEKIT_URL ?? '';
  }

  async createToken(roomName: string, identity: string, name?: string | null): Promise<string> {
    const at = new AccessToken(
      process.env.LIVEKIT_API_KEY ?? '',
      process.env.LIVEKIT_API_SECRET ?? '',
      { identity, name: name ?? undefined, ttl: '2h' },
    );
    at.addGrant({ room: roomName, roomJoin: true, canPublish: true, canSubscribe: true });
    return at.toJwt();
  }
}
