import './env'; // must stay first: loads .env before any other module reads process.env
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import { RedisIoAdapter } from './redis/redis-io.adapter';
import { corsOrigin } from './common/cors';
import { requestLogger } from './common/request-logger';
import helmet from 'helmet';

async function bootstrap() {
  // rawBody is required for Stripe webhook signature verification.
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { rawBody: true });
  // Reports can carry a small JPEG evidence frame.
  app.useBodyParser('json', { limit: '1mb' });
  const ioAdapter = new RedisIoAdapter(app);
  ioAdapter.connectToRedis();
  app.useWebSocketAdapter(ioAdapter);
  // Security headers. The API serves JSON only; the frontend gets its own CSP from the web server.
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.use(requestLogger);
  app.setGlobalPrefix('api');
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.enableCors({
    origin: corsOrigin,
    credentials: true,
  });
  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
