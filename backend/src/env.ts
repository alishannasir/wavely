import { config } from 'dotenv';
import { existsSync } from 'fs';

/**
 * Must be the FIRST import of main.ts. Several modules read process.env while they are being
 * imported (e.g. the websocket CORS origin in the gateway decorator, rate-limit constants), which
 * happens before Nest's ConfigModule has loaded .env. Loading it here makes .env work everywhere.
 * Existing environment variables always win over .env; backend/.env wins over the repo-root .env.
 */
for (const file of ['.env', '../.env']) {
  if (existsSync(file)) config({ path: file });
}
