import pino from 'pino';
import { env } from '../config/env';
export const logger = pino({
  level: env.LOG_LEVEL,
  redact: [
    'password',
    'authorization',
    'req.headers.authorization',
    'apiKey',
    'token',
    'DATABASE_URL',
    'REDIS_URL',
  ],
  base: { service: 'smartcompare-api' },
});
