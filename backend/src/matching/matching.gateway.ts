import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { randomUUID } from 'crypto';
import { Server, Socket } from 'socket.io';
import { PrismaService } from '../prisma/prisma.service';
import { MatchingService, QueueEntry, RELAX_COUNTRY_MS, RELAX_GENDER_MS } from './matching.service';
import { CallStateService } from './call-state.service';
import { LivekitService } from './livekit.service';
import { EntitlementsService } from '../payments/entitlements.service';
import { FriendsService } from '../friends/friends.service';
import { PresenceService } from '../friends/presence.service';
import { MessagesService } from '../friends/messages.service';
import { ReportsService } from '../moderation/reports.service';
import { BansService } from '../moderation/bans.service';
import { clientIp, sanitizeDeviceId } from '../common/client-info';
import { AuthService } from '../auth/auth.service';
import { isCountryAllowed, resolveCountry } from '../common/geo/geo.config';

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

const MAX_MATCH_ATTEMPTS = 50; // each stale peer is removed from the queue, so this always ends
const REMATCH_TICK_MS = 5000;

const userRoom = (userId: string) => `user:${userId}`;

/**
 * Signaling only. Media flows client <-> LiveKit SFU, never through here.
 * All shared state (queue, active calls, pending calls, presence) lives in Redis, and
 * Socket.IO uses the Redis adapter, so several API instances can run side by side.
 */
@WebSocketGateway({ cors: { origin: process.env.FRONTEND_URL ?? 'http://localhost:5173' } })
export class MatchingGateway implements OnGatewayConnection, OnGatewayDisconnect, OnModuleInit, OnModuleDestroy {
  @WebSocketServer()
  server!: Server;

  private rematchTimer?: NodeJS.Timeout;

  constructor(
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
    private readonly matching: MatchingService,
    private readonly callState: CallStateService,
    private readonly livekit: LivekitService,
    private readonly entitlements: EntitlementsService,
    private readonly friends: FriendsService,
    private readonly presence: PresenceService,
    private readonly messages: MessagesService,
    private readonly bans: BansService,
    private readonly reports: ReportsService,
  ) {}

  onModuleInit() {
    this.rematchTimer = setInterval(() => void this.rematchTick().catch(() => undefined), REMATCH_TICK_MS);
    this.rematchTimer.unref();
  }

  onModuleDestroy() {
    if (this.rematchTimer) clearInterval(this.rematchTimer);
  }

  async handleConnection(client: Socket) {
    try {
      const token = client.handshake.auth?.token as string | undefined;
      const payload = this.jwt.verify<{ sub: string }>(token ?? '');
      const ip = clientIp(client.handshake.headers, client.handshake.address);
      const deviceId = sanitizeDeviceId(client.handshake.auth?.deviceId);
      if (await this.bans.isBlocked(ip, deviceId)) {
        client.emit('match-error', { code: 'BANNED', message: 'Access denied.' });
        client.disconnect(true);
        return;
      }
      client.data.userId = payload.sub;
      const country = resolveCountry(client.handshake.headers);
      if (!isCountryAllowed(country)) {
        client.emit('match-error', { code: 'REGION_BLOCKED', message: 'This service is not available in your region.' });
        client.disconnect(true);
        return;
      }
      const me = await this.prisma.user.update({
        where: { id: payload.sub },
        data: { ...(deviceId ? { lastDeviceId: deviceId } : {}), ...(ip ? { lastIp: ip } : {}) },
      });
      client.data.isGuest = me.isGuest;
      // Every tab/device joins the user's room, so direct emits reach all of them.
      await client.join(userRoom(payload.sub));
      await this.presence.markOnline(payload.sub, client.id);
    } catch {
      client.disconnect(true);
    }
  }

  async handleDisconnect(client: Socket) {
    const userId = client.data.userId as string | undefined;
    if (userId) {
      await this.presence.markOffline(userId, client.id);
      await this.matching.removeFromQueue(userId, client.id);
      await this.dropPendingCallsBy(userId, client.id);
    }
    await this.endActiveCall(client);
  }

  private async isSocketAlive(socketId: string): Promise<boolean> {
    const sockets = await this.server.in(socketId).fetchSockets();
    return sockets.length > 0;
  }

  /**
   * One active queue entry or call per user. A new tab takes over: the older tab's call/queue
   * is ended and it is told with `session-replaced`.
   */
  private async takeOver(userId: string, client: Socket) {
    const callSocketId = await this.callState.socketInCall(userId);
    if (callSocketId) {
      if (callSocketId === client.id) {
        await this.endActiveCall(client); // client asked for a new match while still in a call
      } else {
        await this.endCallBySocketId(callSocketId);
        this.server.to(callSocketId).emit('session-replaced');
      }
    }
    const queued = await this.matching.getQueued(userId);
    if (queued && queued.socketId !== client.id) {
      this.server.to(queued.socketId).emit('session-replaced');
    }
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
    if (!user.rulesAcceptedAt) {
      client.emit('match-error', { code: 'RULES_REQUIRED', message: 'Please accept the rules first.' });
      return;
    }
    // 18+ gate: OAuth signups without a birthdate must finish onboarding first.
    if (!AuthService.isAdultUser(user)) {
      client.emit('match-error', {
        code: 'AGE_REQUIRED',
        message: 'Please confirm you are 18 or older before matching.',
      });
      return;
    }

    // Server-side tier enforcement (trial / paid / free caps).
    const check = await this.entitlements.canStartMatch(user);
    if (!check.ok) {
      client.emit('limit-reached', { message: check.reason });
      return;
    }

    await this.takeOver(userId, client);

    const filtersAllowed = check.entitlement.filtersEnabled && !user.isGuest;
    const entry: QueueEntry = {
      userId,
      socketId: client.id,
      displayName: user.displayName,
      gender: user.gender,
      country: user.country,
      flagged: !!user.flaggedUntil && user.flaggedUntil > new Date(),
      preferredGender: filtersAllowed ? payload?.preferredGender ?? null : null,
      preferredCountry: filtersAllowed ? payload?.preferredCountry?.toUpperCase() ?? null : null,
    };

    const peer = await this.matchOrQueue(entry);
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

  /** Atomic claim, skipping peers whose socket has disappeared since they queued. */
  private async matchOrQueue(entry: QueueEntry, keepQueuedAt = false): Promise<QueueEntry | null> {
    for (let i = 0; i < MAX_MATCH_ATTEMPTS; i++) {
      const peer = await this.matching.findOrQueue(entry, keepQueuedAt);
      if (!peer) return null;
      if (await this.isSocketAlive(peer.socketId)) return peer;
    }
    return null;
  }

  /**
   * Waiting users with filters would otherwise only match when someone new arrives. Every few
   * seconds, re-scan users whose filters have just relaxed (one instance at a time).
   */
  private async rematchTick() {
    if (!(await this.matching.tryLock('rematch-tick', REMATCH_TICK_MS - 500))) return;
    for (const waiting of await this.matching.staleWaiting()) {
      const waitedMs = Date.now() - (waiting.queuedAt ?? Date.now());
      const relaxedNow =
        (!!waiting.preferredCountry && waitedMs >= RELAX_COUNTRY_MS && waitedMs < RELAX_COUNTRY_MS + REMATCH_TICK_MS) ||
        (!!waiting.preferredGender && waitedMs >= RELAX_GENDER_MS && waitedMs < RELAX_GENDER_MS + REMATCH_TICK_MS);
      if (relaxedNow) this.server.to(waiting.socketId).emit('filters-relaxed');

      const peer = await this.matchOrQueue(waiting, true);
      if (!peer) continue;
      const me = await this.prisma.user.findUnique({ where: { id: waiting.userId } });
      await this.startCall(
        'match-found',
        { userId: peer.userId, socketId: peer.socketId, displayName: peer.displayName, country: peer.country },
        { userId: waiting.userId, socketId: waiting.socketId, displayName: me?.displayName ?? null, country: me?.country ?? null },
      );
    }
  }

  private canCall(user: { status: string; birthdate: Date | null; adultAttestedAt?: Date | null; isGuest?: boolean }): boolean {
    return user.status === 'ACTIVE' && AuthService.isAdultUser(user);
  }

  @SubscribeMessage('call-friend')
  async callFriend(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload?: { friendUserId?: string },
  ) {
    const userId = client.data.userId as string;
    if (client.data.isGuest) {
      client.emit('call-unavailable', { message: 'Create a free account to call friends.' });
      return;
    }
    const friendUserId = payload?.friendUserId;
    if (!friendUserId || !(await this.friends.areFriends(userId, friendUserId))) {
      client.emit('call-unavailable', { message: 'You can only call friends.' });
      return;
    }
    if (!(await this.presence.isOnline(friendUserId))) {
      client.emit('call-unavailable', { message: 'Your friend is offline.' });
      return;
    }
    if (await this.callState.socketInCall(friendUserId)) {
      client.emit('call-unavailable', { message: 'Your friend is in another call.' });
      return;
    }
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || !this.canCall(user)) {
      client.emit('call-unavailable', { message: 'Your account cannot place calls right now.' });
      return;
    }
    await this.takeOver(userId, client);
    await this.matching.removeFromQueue(userId);
    const callId = randomUUID();
    await this.callState.addPending(callId, {
      callerUserId: userId,
      callerSocketId: client.id,
      calleeUserId: friendUserId,
    });
    this.server.to(userRoom(friendUserId)).emit('incoming-call', {
      callId,
      from: { userId, displayName: user.displayName ?? null },
    });
  }

  @SubscribeMessage('accept-call')
  async acceptCall(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload?: { callId?: string },
  ) {
    const callId = payload?.callId ?? '';
    const peeked = await this.callState.peekPending(callId);
    if (!peeked || peeked.calleeUserId !== client.data.userId) {
      client.emit('call-unavailable', { message: 'This call is no longer available.' });
      return;
    }
    // Single-use: if two tabs of the callee accept at once, only one wins.
    const pending = await this.callState.takePending(callId);
    if (!pending) {
      client.emit('call-unavailable', { message: 'This call is no longer available.' });
      return;
    }
    // Caller may have left or closed the tab since ringing.
    if (!(await this.isSocketAlive(pending.callerSocketId))) {
      client.emit('call-unavailable', { message: 'The caller is no longer available.' });
      return;
    }
    // Other tabs of the callee stop ringing.
    this.server.to(userRoom(pending.calleeUserId)).emit('call-cancelled', { callId });

    const [caller, callee] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: pending.callerUserId } }),
      this.prisma.user.findUnique({ where: { id: pending.calleeUserId } }),
    ]);
    if (!caller || !callee || !this.canCall(caller) || !this.canCall(callee)) {
      client.emit('call-unavailable', { message: 'This call is no longer available.' });
      return;
    }

    await this.takeOver(callee.id, client);
    await this.matching.removeFromQueue(callee.id);
    await this.startCall(
      'call-started',
      { userId: caller.id, socketId: pending.callerSocketId, displayName: caller.displayName, country: caller.country },
      { userId: callee.id, socketId: client.id, displayName: callee.displayName, country: callee.country },
    );
  }

  @SubscribeMessage('decline-call')
  async declineCall(@ConnectedSocket() client: Socket, @MessageBody() payload?: { callId?: string }) {
    const callId = payload?.callId ?? '';
    const peeked = await this.callState.peekPending(callId);
    if (!peeked || peeked.calleeUserId !== client.data.userId) return;
    const pending = await this.callState.takePending(callId);
    if (!pending) return;
    this.server.to(userRoom(pending.calleeUserId)).emit('call-cancelled', { callId });
    this.server.to(pending.callerSocketId).emit('call-declined');
  }

  @SubscribeMessage('send-message')
  async sendMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload?: { toUserId?: string; content?: string },
  ) {
    if (client.data.isGuest) {
      client.emit('message-error', { message: 'Create a free account to send messages.' });
      return;
    }
    try {
      const message = await this.messages.create(
        client.data.userId as string,
        payload?.toUserId ?? '',
        payload?.content ?? '',
      );
      this.server.to(userRoom(message.receiverId)).emit('new-message', message);
      client.emit('message-sent', message);
    } catch (err) {
      client.emit('message-error', { message: (err as Error).message });
    }
  }

  /** In-call text chat. Relayed by the server so it can be attached to abuse reports. */
  @SubscribeMessage('call-chat')
  async callChat(@ConnectedSocket() client: Socket, @MessageBody() payload?: { text?: string }) {
    const info = await this.callState.getBySocket(client.id);
    if (!info) return;
    const line = await this.callState.pushChat(info.sessionId, info.userId, payload?.text);
    if (!line) return;
    this.server.to(info.peerSocketId).emit('call-chat', { text: line.text, at: line.at });
  }

  /**
   * The viewer's browser classified the stranger's video as explicit. Only accepted for the call this
   * socket is actually in, and only about that call's peer. Becomes a moderator report.
   */
  @SubscribeMessage('nsfw-flag')
  async nsfwFlag(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload?: { sessionId?: string; score?: number; evidenceImage?: string },
  ) {
    const info = await this.callState.getBySocket(client.id);
    if (!info || !payload || info.sessionId !== payload.sessionId) return;
    const score = typeof payload.score === 'number' && Number.isFinite(payload.score) ? payload.score : 0;
    try {
      await this.reports.createAutoNsfw(info.userId, info.peerUserId, info.sessionId, score, payload.evidenceImage);
    } catch {
      /* rate limited or invalid: the client already blurred locally, nothing to tell it */
    }
  }

  @SubscribeMessage('leave')
  async leave(@ConnectedSocket() client: Socket) {
    const userId = client.data.userId as string | undefined;
    if (userId) {
      await this.matching.removeFromQueue(userId, client.id);
      await this.dropPendingCallsBy(userId, client.id);
    }
    await this.endActiveCall(client);
  }

  /** Cancels ringing calls placed from this socket and tells the callee's tabs to stop ringing. */
  private async dropPendingCallsBy(userId: string, socketId: string) {
    const dropped = await this.callState.dropPendingByCaller(userId, socketId);
    for (const call of dropped) {
      this.server.to(userRoom(call.calleeUserId)).emit('call-cancelled', { callerUserId: userId });
    }
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

    await this.callState.setActive(session.id, a, b);
    await this.matching.recordPair(a.userId, b.userId);

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
    await this.endCallBySocketId(client.id);
  }

  private async endCallBySocketId(socketId: string) {
    // Atomic: exactly one of the two sides (or two instances) ends the call and records usage.
    const info = await this.callState.endBySocket(socketId);
    if (!info) return;
    this.server.to(info.peerSocketId).emit('peer-left');
    await this.matching.closeSession(info.sessionId);
  }
}
