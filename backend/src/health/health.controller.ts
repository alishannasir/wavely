import { Controller, Get, HttpException, HttpStatus, Inject } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import Redis from 'ioredis';
import { PrismaService } from '../prisma/prisma.service';
import { REDIS } from '../redis/redis.module';
import { SkipGeo } from '../common/geo/skip-geo.decorator';

const TIMEOUT_MS = 2000;

function withTimeout<T>(p: Promise<T>): Promise<T> {
  return Promise.race([p, new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), TIMEOUT_MS))]);
}

/** For uptime monitors and container health checks. 200 only if Postgres and Redis both answer. */
@SkipGeo()
@SkipThrottle()
@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(REDIS) private readonly redis: Redis,
  ) {}

  @Get()
  async check() {
    const [db, cache] = await Promise.all([
      withTimeout(this.prisma.$queryRaw`SELECT 1`).then(() => 'up', () => 'down'),
      withTimeout(this.redis.ping()).then(() => 'up', () => 'down'),
    ]);
    const body = { status: db === 'up' && cache === 'up' ? 'ok' : 'degraded', db, redis: cache };
    if (body.status !== 'ok') throw new HttpException(body, HttpStatus.SERVICE_UNAVAILABLE);
    return body;
  }
}
