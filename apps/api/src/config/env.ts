import { config } from 'dotenv';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
config({
  path: fileURLToPath(
    new URL(
      import.meta.url.includes('/dist/') ? '../../../.env' : '../../../../.env',
      import.meta.url,
    ),
  ),
  quiet: true,
});
const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  API_HOST: z.string().default(process.env['NODE_ENV'] === 'production' ? '0.0.0.0' : '127.0.0.1'),
  CORS_ORIGIN: z.string().default('http://localhost:3000,http://127.0.0.1:3000'),
  DATABASE_URL: z.string().optional(),
  REDIS_URL: z.string().optional(),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  USE_QUEUE: z.enum(['true', 'false']).default('false'),
  ALLOW_DEGRADED_MODE: z.enum(['true', 'false']).optional(),
});
export const env = schema.parse(process.env);
export const allowDegraded =
  env.ALLOW_DEGRADED_MODE === 'true' ||
  (env.NODE_ENV !== 'production' && env.ALLOW_DEGRADED_MODE !== 'false');
