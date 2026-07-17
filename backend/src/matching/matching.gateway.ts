import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { JwtService } from '@nestjs/jwt';
import { randomUUID } from 'crypto';
import { Server, Socket } from 'socket.io';
import { PrismaService } from '../prisma/prisma.service';
import { MatchingService, QueueEntry } from './matching.service';
import { LivekitService } from './livekit.service';
import { EntitlementsService } from '../payments/entitlements.service';
import { FriendsService } from '../friends/friends.service';
import { PresenceService } from '../friends/presence.service';
import { MessagesService } from '../friends/messages.service';

interface FindMatchPayload {
  preferredGender?: string;
  preferredCountry?: string;
}

interface Participant {
  userId: string;
  socketId: string;
  displayName: string | null;
  country: string | null;
}

/**
 * Signaling only. Media flows client <-> LiveKit SFU, never through here.
 */
@WebSocketGateway({ cors: { origin: process.env.FRONTEND_URL ?? 'http://localhost:5173' } })
export class MatchingGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server;

  // socketId -> active call info. In-memory is fine single-instance;
  // move to Redis when the API scales horizontally.
  private readonly active = new Map<string, { sessionId: string; peerSocketId: string }>();
  // callId -> pending direct (friend) call awaiting accept/decline.
  private readonly pendingCalls = new Map<
    string,
    { callerUserId: string; callerSocketId: string; calleeUserId: string }
  >();

  constructor(
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
    private readonly matching: MatchingService,
    private readonly livekit: LivekitService,
    private readonly entitlements: EntitlementsService,
    private readonly friends: FriendsService,
    private readonly presence: PresenceService,
    private readonly messages: MessagesService,
  ) {}

  async handleConnection(client: Socket) {
    try {
      const token = client.handshake.auth?.token as string | undefined;
      const payload = this.jwt.verify<{ sub: string }>(token ?? '');
      client.data.userId = payload.sub;
      await this.presence.markOnline(payload.sub, client.id);
    } catch {
      client.disconnect(true);
    }
  }

  async handleDisconnect(client: Socket) {
    const userId = client.data.userId as string | undefined;
    if (userId) {
      await this.presence.markOffline(userId, client.id);
      await this.matching.removeFromQueue(userId);
    }
    await this.endActiveCall(client);
  }

  @SubscribeMessage('find-match')
  async findMatch(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload?: FindMatchPayload,
  ) {
    const userId = client.data.userId as string;
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || user.status !== 'ACTIVE') {
      client.emit('match-error', { message: 'Your account cannot join matches right now.' });
      return;
    }

    // Server-side tier enforcement (trial / paid / free caps).
    const check = await this.entitlements.canStartMatch(user);
    if (!check.ok) {
      client.emit('limit-reached', { message: check.reason });
      return;
    }

    const filtersAllowed = check.entitlement.filtersEnabled;
    const entry: QueueEntry = {
      userId,
      socketId: client.id,
      displayName: user.displayName,
      gender: user.gender,
      country: user.country,
      preferredGender: filtersAllowed ? payload?.preferredGender ?? null : null,
      preferredCountry: filtersAllowed ? payload?.preferredCountry?.toUpperCase() ?? null : null,
    };

    const peer = await this.matching.findOrQueue(entry);
    if (!peer) {
      client.emit('searching');
      return;
    }

    await this.startCall(
      'match-found',
      { userId: peer.userId, socketId: peer.socketId, displayName: peer.displayName, country: peer.country },
      { userId, socketId: client.id, displayName: user.displayName, country: user.country },
    );
  }

  @SubscribeMessage('call-friend')
  async callFriend(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload?: { friendUserId?: string },
  ) {
    const userId = client.data.userId as string;
    const friendUserId = payload?.friendUserId;
    if (!friendUserId || !(await this.friends.areFriends(userId, friendUserId))) {
      client.emit('call-unavailable', { message: 'You can only call friends.' });
      return;
    }
    const calleeSocketId = await this.presence.socketFor(friendUserId);
    if (!calleeSocketId) {
      client.emit('call-unavailable', { message: 'Your friend is offline.' });
      return;
    }
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    const callId = randomUUID();
    this.pendingCalls.set(callId, {
      callerUserId: userId,
      callerSocketId: client.id,
      calleeUserId: friendUserId,
    });
    this.server.to(calleeSocketId).emit('incoming-call', {
      callId,
      from: { userId, displayName: user?.displayName ?? null },
    });
  }

  @SubscribeMessage('accept-call')
  async acceptCall(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload?: { callId?: string },
  ) {
    const pending = this.pendingCalls.get(payload?.callId ?? '');
    if (!pending || pending.calleeUserId !== client.data.userId) {
      client.emit('call-unavailable', { message: 'This call is no longer available.' });
      return;
    }
    this.pendingCalls.delete(payload!.callId!);

    const [caller, callee] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: pending.callerUserId } }),
      this.prisma.user.findUnique({ where: { id: pending.calleeUserId } }),
    ]);
    if (!caller || !callee) {
      client.emit('call-unavailable', { message: 'This call is no longer available.' });
      return;
    }

    await this.startCall(
      'call-started',
      { userId: caller.id, socketId: pending.callerSocketId, displayName: caller.displayName, country: caller.country },
      { userId: callee.id, socketId: client.id, displayName: callee.displayName, country: callee.country },
    );
  }

  @SubscribeMessage('decline-call')
  declineCall(@ConnectedSocket() client: Socket, @MessageBody() payload?: { callId?: string }) {
    const pending = this.pendingCalls.get(payload?.callId ?? '');
    if (!pending || pending.calleeUserId !== client.data.userId) return;
    this.pendingCalls.delete(payload!.callId!);
    this.server.to(pending.callerSocketId).emit('call-declined');
  }

  @SubscribeMessage('send-message')
  async sendMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload?: { toUserId?: string; content?: string },
  ) {
    try {
      const message = await this.messages.create(
        client.data.userId as string,
        payload?.toUserId ?? '',
        payload?.content ?? '',
      );
      const recipientSocket = await this.presence.socketFor(message.receiverId);
      if (recipientSocket) this.server.to(recipientSocket).emit('new-message', message);
      client.emit('message-sent', message);
    } catch (err) {
      client.emit('message-error', { message: (err as Error).message });
    }
  }

  @SubscribeMessage('leave')
  async leave(@ConnectedSocket() client: Socket) {
    const userId = client.data.userId as string | undefined;
    if (userId) await this.matching.removeFromQueue(userId);
    await this.endActiveCall(client);
  }

  /** Shared by random matches and direct friend calls. */
  private async startCall(event: 'match-found' | 'call-started', a: Participant, b: Participant) {
    const session = await this.prisma.callSession.create({
      data: { userAId: a.userId, userBId: b.userId },
    });
    const roomName = `room_${session.id}`;
    await this.prisma.callSession.update({ where: { id: session.id }, data: { roomId: roomName } });

    const [tokenA, tokenB] = await Promise.all([
      this.livekit.createToken(roomName, a.userId, a.displayName),
      this.livekit.createToken(roomName, b.userId, b.displayName),
    ]);

    this.active.set(a.socketId, { sessionId: session.id, peerSocketId: b.socketId });
    this.active.set(b.socketId, { sessionId: session.id, peerSocketId: a.socketId });

    const url = this.livekit.url;
    this.server.to(a.socketId).emit(event, {
      roomName,
      token: tokenA,
      url,
      sessionId: session.id,
      peer: { userId: b.userId, displayName: b.displayName, country: b.country },
    });
    this.server.to(b.socketId).emit(event, {
      roomName,
      token: tokenB,
      url,
      sessionId: session.id,
      peer: { userId: a.userId, displayName: a.displayName, country: a.country },
    });
  }

  private async endActiveCall(client: Socket) {
    const info = this.active.get(client.id);
    if (!info) return;
    this.active.delete(client.id);
    this.active.delete(info.peerSocketId);
    this.server.to(info.peerSocketId).emit('peer-left');
    await this.matching.closeSession(info.sessionId);
  }
}
