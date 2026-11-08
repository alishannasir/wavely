-- Same address, same account: store emails lower-case. An address that would collide with an existing lower-case one is left alone.
UPDATE "users" u
SET "email" = lower(btrim(u."email"))
WHERE u."email" IS NOT NULL
  AND u."email" <> lower(btrim(u."email"))
  AND NOT EXISTS (SELECT 1 FROM "users" o WHERE o."email" = lower(btrim(u."email")) AND o."id" <> u."id");

-- CreateIndex
CREATE INDEX "friends_userBId_idx" ON "friends"("userBId");

-- CreateIndex
CREATE INDEX "messages_senderId_receiverId_createdAt_idx" ON "messages"("senderId", "receiverId", "createdAt");

-- CreateIndex
CREATE INDEX "messages_receiverId_createdAt_idx" ON "messages"("receiverId", "createdAt");

-- CreateIndex
CREATE INDEX "reports_evidenceExpiresAt_idx" ON "reports"("evidenceExpiresAt");

-- CreateIndex
CREATE INDEX "sessions_userAId_idx" ON "sessions"("userAId");

-- CreateIndex
CREATE INDEX "sessions_userBId_idx" ON "sessions"("userBId");

-- CreateIndex
CREATE INDEX "sessions_endedAt_startedAt_idx" ON "sessions"("endedAt", "startedAt");

-- CreateIndex
CREATE INDEX "subscriptions_userId_status_idx" ON "subscriptions"("userId", "status");

