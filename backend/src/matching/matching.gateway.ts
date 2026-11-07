import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { createHash, randomUUID } from 'crypto';
import { Server, Socket } from 'socket.io';
import { PrismaService } from '../prisma/prisma.service';
import { MatchingService, QueueEntry, RELAX_COUNTRY_MS, RELAX_GENDER_MS } from './matching.service';
import { CallStateService } from './call-state.service';
import { LivekitService, tokenTtlSeconds } from './livekit.service';
import { computeCallDeadline } from './call-limits';
import { EntitlementsService } from '../payments/entitlements.service';
import { FriendsService } from '../friends/friends.service';
import { PresenceService } from '../friends/presence.service';
import { MessagesService } from '../friends/messages.service';
import { ReportsService } from '../moderation/reports.service';
import { BansService } from '../moderation/bans.service';
import { clientIp, sanitizeDeviceId } from '../common/client-info';
import { filterChatText } from '../common/text-filter';
import { AuthService } from '../auth/auth.service';
import { corsOrigin } from '../common/cors';
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
const DEADLINE_TICK_MS = 5000;
const PRESENCE_HEARTBEAT_MS = 30_000;
const LIMIT_MESSAGE = 'You have used your free chat time for today. Upgrade for unlimited chat.';

const userRoom = (userId: string) => `user:${userId}`;

/**
 * Signaling only. Media flows client <-> LiveKit SFU, never through here.
 * All shared state (queue, active calls, pending calls, presence) lives in Redis, and
 * Socket.IO uses the Redis adapter, so several API instances can run side by side.
 */
@WebSocketGateway({ cors: { origin: corsOrigin } })
export class MatchingGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect, OnModuleInit, OnModuleDestroy
{
  @WebSocketServer()
  server!: Server;

  private rematchTimer?: NodeJS.Timeout;
  private deadlineTimer?: NodeJS.Timeout;
  private presenceTimer?: NodeJS.Timeout;

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
    this.deadlineTimer = setInterval(() => void this.deadlineTick().catch(() => undefined), DEADLINE_TICK_MS);
    this.deadlineTimer.unref();
    this.presenceTimer = setInterval(() => void this.presenceTick().catch(() => undefined), PRESENCE_HEARTBEAT_MS);
    this.presenceTimer.unref();
  }

  /** Keeps presence alive for users connected to this instance; entries nobody refreshes expire. */
  private async presenceTick() {
    const ids: string[] = [];
    for (const socket of this.server.sockets.sockets.values()) {
      if (socket.data.userId) ids.push(socket.data.userId as string);
    }
    await this.presence.heartbeat(ids);
  }

  onModuleDestroy() {
    if (this.rematchTimer) clearInterval(this.rematchTimer);
    if (this.deadlineTimer) clearInterval(this.deadlineTimer);
    if (this.presenceTimer) clearInterval(this.presenceTimer);
  }

  /**
   * Authentication runs as a Socket.IO middleware, so a socket is only "connected" (and can send
   * events) once the user is identified. Rejections reach the client as `connect_error` with one
   * of: UNAUTHORIZED (bad/expired token), BANNED, REGION_BLOCKED, SERVER_ERROR (retryable).
   */
  afterInit(server: Server) {
    server.use(async (socket, next) => {
      try {
        const token = socket.handshake.auth?.token as string | undefined;
        let userId: string;
        let tokenVersion = 0;
        try {
          const payload = this.jwt.verify<{ sub: string; tv?: number }>(token ?? '');
          userId = payload.sub;
          tokenVersion = payload.tv ?? 0;
        } catch {
          return next(new Error('UNAUTHORIZED'));
        }
        const ip = clientIp(socket.handshake.headers, socket.handshake.address);
        const deviceId = sanitizeDeviceId(socket.handshake.auth?.deviceId);
        if (await this.bans.isBlocked(ip, deviceId)) return next(new Error('BANNED'));
        if (!isCountryAllowed(resolveCountry(socket.handshake.headers))) return next(new Error('REGION_BLOCKED'));

        const me = await this.prisma.user
          .update({
            where: { id: userId },
            data: { ...(deviceId ? { lastDeviceId: deviceId } : {}), ...(ip ? { lastIp: ip } : {}) },
          })
          .catch((err: { code?: string }) => {
            if (err?.code === 'P2025') return null; // record not found: the user was deleted
            throw err; // anything else is a temporary database problem, not a reason to log the user out
          });
        if (!me) return next(new Error('UNAUTHORIZED'));
        if (me.status === 'BANNED') return next(new Error('BANNED'));
        if (me.tokenVersion !== tokenVersion) return next(new Error('UNAUTHORIZED')); // signed out by a password/email change

        socket.data.userId = userId;
        socket.data.isGuest = me.isGuest;
        socket.data.emailVerified = !!me.emailVerifiedAt;
        // Every tab/device joins the user's room, so direct emits reach all of them.
        await socket.join(userRoom(userId));
        next();
      } catch {
        next(new Error('SERVER_ERROR')); // DB/Redis hiccup: the client retries, it does not log out
      }
    });
  }

  async handleConnection(client: Socket) {
    const userId = client.data.userId as string | undefined;
    if (!userId) return;
    await this.presence.markOnline(userId, client.id);
    // The socket may have dropped while we were writing presence; don't leave the user "online".
    if (!client.connected) await this.presence.markOffline(userId, client.id);
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
    // Starting a search or a call cancels any friend call this user still has ringing.
    for (const call of await this.callState.dropPendingByCaller(userId)) {
      this.server.to(userRoom(call.calleeUserId)).emit('call-cancelled', { callerUserId: userId });
      if (call.callerSocketId !== client.id) {
        this.server.to(call.callerSocketId).emit('call-unavailable', { message: 'Call cancelled.' });
      }
    }
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
      // Only the first attempt requires the user to still be waiting: after it, the Lua script has
      // already taken them out of the queue (they are "in hand") while we vet the claimed peer.
      const peer = await this.matching.findOrQueue(entry, { keepQueuedAt, requireWaiting: keepQueuedAt && i === 0 });
      if (!peer) return null;
      if ((await this.isSocketAlive(peer.socketId)) && (await this.peerEligible(peer))) return peer;
    }
    // Every peer we claimed was unusable, and the searcher is in hand: put them back in the queue.
    await this.matching.enqueueOnly(entry);
    return null;
  }

  /**
   * A queued peer may have used up their free time (or been suspended) since they queued. They were
   * already removed from the queue, so just tell them and let the caller look for someone else.
   */
  private async peerEligible(peer: QueueEntry): Promise<boolean> {
    const user = await this.prisma.user.findUnique({ where: { id: peer.userId } });
    if (!user || user.status !== 'ACTIVE') {
      this.server.to(peer.socketId).emit('match-error', { message: 'Your account cannot join matches right now.' });
      return false;
    }
    const check = await this.entitlements.canStartMatch(user);
    if (!check.ok) {
      this.server.to(peer.socketId).emit('limit-reached', { message: check.reason });
      return false;
    }
    return true;
  }

  /** Ends calls whose free-tier minutes ran out: tell the user, remove them from LiveKit, close the session. */
  private async deadlineTick() {
    for (const due of await this.callState.claimDue(Date.now())) {
      const limitedIdx = due.users.indexOf(due.limitedUserId ?? '');
      const limitedSocket = limitedIdx >= 0 ? due.sockets[limitedIdx] : due.sockets[0];
      this.server.to(limitedSocket).emit('limit-reached', { message: LIMIT_MESSAGE });
      void this.livekit.removeParticipants(`room_${due.sessionId}`, due.users);
      await this.endCallBySocketId(limitedSocket);
    }
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

  /** Same gates as find-match: active account, accepted the rules, adult. */
  private canCall(user: {
    status: string;
    birthdate: Date | null;
    rulesAcceptedAt?: Date | null;
    adultAttestedAt?: Date | null;
    isGuest?: boolean;
  }): boolean {
    return user.status === 'ACTIVE' && !!user.rulesAcceptedAt && AuthService.isAdultUser(user);
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
    const check = await this.entitlements.canStartMatch(user);
    if (!check.ok) {
      client.emit('limit-reached', { message: check.reason });
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
    // The caller may have started another call since ringing.
    if (await this.callState.socketInCall(pending.callerUserId)) {
      client.emit('call-unavailable', { message: 'The caller is busy.' });
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

    const [callerCheck, calleeCheck] = await Promise.all([
      this.entitlements.canStartMatch(caller),
      this.entitlements.canStartMatch(callee),
    ]);
    if (!calleeCheck.ok) {
      client.emit('limit-reached', { message: calleeCheck.reason });
      this.server.to(pending.callerSocketId).emit('call-unavailable', { message: 'Your friend cannot take calls right now.' });
      return;
    }
    if (!callerCheck.ok) {
      this.server.to(pending.callerSocketId).emit('limit-reached', { message: callerCheck.reason });
      client.emit('call-unavailable', { message: 'The caller cannot place calls right now.' });
      return;
    }
    await this.takeOver(callee.id, client);
    await this.matching.removeFromQueue(callee.id);
    await this.matching.removeFromQueue(caller.id);
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
  async callChat(@ConnectedSocket() client: Socket, @MessageBody() payload?: { text?: string; cid?: number }) {
    const info = await this.callState.getBySocket(client.id);
    if (!info) return;
    if (await this.isRepeatSpam(info.userId, payload?.text)) {
      client.emit('chat-warning', { message: 'Please do not repeat the same message.' });
      return;
    }
    // The original is stored for report evidence; the other person only sees the filtered version.
    const line = await this.callState.pushChat(info.sessionId, info.userId, payload?.text);
    if (!line) return;
    const filtered = filterChatText(line.text, { allowLinks: !client.data.isGuest && !!client.data.emailVerified });
    this.server.to(info.peerSocketId).emit('call-chat', { text: filtered.text, at: line.at });
    if (filtered.changed) {
      // Tell the sender what the other person sees, so nothing is hidden silently.
      client.emit('call-chat-ack', { cid: payload?.cid, text: filtered.text, links: filtered.links, profanity: filtered.profanity });
    }
  }

  /** The same message more than 3 times in 30 seconds is spam. */
  private async isRepeatSpam(userId: string, text: unknown): Promise<boolean> {
    if (typeof text !== 'string') return false;
    const norm = text.toLowerCase().replace(/\s+/g, ' ').trim();
    if (!norm) return false;
    const key = `chat:dup:${userId}:${createHash('sha1').update(norm).digest('hex').slice(0, 16)}`;
    const n = await this.callState.bump(key, 30);
    return n > 3;
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
  private async dropPendingCallsBy(userId: string, socketId?: string) {
    const dropped = await this.callState.dropPendingByCaller(userId, socketId);
    for (const call of dropped) {
      this.server.to(userRoom(call.calleeUserId)).emit('call-cancelled', { callerUserId: userId });
    }
  }

  /** Shared by random matches and direct friend calls. */
  private async startCall(event: 'match-found' | 'call-started', a: Participant, b: Participant) {
    // Free-tier time left decides the call deadline and how long the LiveKit tokens are valid.
    const users = await this.prisma.user.findMany({ where: { id: { in: [a.userId, b.userId] } } });
    const left = await Promise.all(
      [a, b].map(async (p) => {
        const user = users.find((u) => u.id === p.userId);
        return { userId: p.userId, remainingMs: user ? await this.entitlements.remainingMs(user) : null };
      }),
    );
    const now = Date.now();
    const deadline = computeCallDeadline(left[0], left[1], now);
    const ttl = tokenTtlSeconds(deadline ? deadline.atMs - now : null);

    const session = await this.prisma.callSession.create({
      data: { userAId: a.userId, userBId: b.userId },
    });
    const roomName = `room_${session.id}`;
    await this.prisma.callSession.update({ where: { id: session.id }, data: { roomId: roomName } });

    const [tokenA, tokenB] = await Promise.all([
      this.livekit.createToken(roomName, a.userId, a.displayName, ttl),
      this.livekit.createToken(roomName, b.userId, b.displayName, ttl),
    ]);

    await this.callState.setActive(session.id, a, b, deadline);
    await this.matching.recordPair(a.userId, b.userId);
    await this.matching.recordMatchStart([a.userId, b.userId]); // counted now, not when the call ends

    const url = this.livekit.url;
    const secondsLeft = (i: number) => (left[i].remainingMs === null ? null : Math.floor(left[i].remainingMs! / 1000));
    this.server.to(a.socketId).emit(event, {
      roomName,
      token: tokenA,
      url,
      sessionId: session.id,
      limitSeconds: secondsLeft(0),
      peer: { userId: b.userId, displayName: b.displayName, country: b.country },
    });
    this.server.to(b.socketId).emit(event, {
      roomName,
      token: tokenB,
      url,
      sessionId: session.id,
      limitSeconds: secondsLeft(1),
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
