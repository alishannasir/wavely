-- CreateEnum
CREATE TYPE "CallKind" AS ENUM ('RANDOM', 'FRIEND');

-- CreateEnum
CREATE TYPE "IdentityStatus" AS ENUM ('PENDING', 'APPROVED', 'DECLINED', 'EXPIRED', 'REVIEW');

-- CreateEnum
CREATE TYPE "GateState" AS ENUM ('PAUSED_VERIFY', 'RESUMED', 'BLOCKED');

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "idVerifiedAt" TIMESTAMP(3),
ADD COLUMN     "verifiedBirthdate" TIMESTAMP(3),
ADD COLUMN     "verifiedSex" "Gender";

-- AlterTable
ALTER TABLE "sessions" ADD COLUMN     "kind" "CallKind" NOT NULL DEFAULT 'RANDOM';

-- CreateTable
CREATE TABLE "identity_verifications" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerRef" TEXT NOT NULL,
    "status" "IdentityStatus" NOT NULL DEFAULT 'PENDING',
    "reasonCode" TEXT,
    "documentCountry" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "identity_verifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "identity_webhook_events" (
    "provider" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "identity_webhook_events_pkey" PRIMARY KEY ("provider","eventId")
);

-- CreateTable
CREATE TABLE "room_gates" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "userAId" TEXT NOT NULL,
    "userBId" TEXT NOT NULL,
    "state" "GateState" NOT NULL,
    "trigger" TEXT NOT NULL,
    "score" DOUBLE PRECISION,
    "pausedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedAt" TIMESTAMP(3),
    "reason" TEXT,

    CONSTRAINT "room_gates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "identity_verifications_providerRef_key" ON "identity_verifications"("providerRef");

-- CreateIndex
CREATE INDEX "identity_verifications_userId_status_idx" ON "identity_verifications"("userId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "room_gates_sessionId_key" ON "room_gates"("sessionId");

-- CreateIndex
CREATE INDEX "room_gates_state_pausedAt_idx" ON "room_gates"("state", "pausedAt");

-- AddForeignKey
ALTER TABLE "identity_verifications" ADD CONSTRAINT "identity_verifications_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "room_gates" ADD CONSTRAINT "room_gates_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
