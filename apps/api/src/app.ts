import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { randomUUID } from 'node:crypto';
import { rateLimit } from 'express-rate-limit';
import { RedisStore } from 'rate-limit-redis';
import type { Redis } from 'ioredis';
import { compareSchema } from '@smartcompare/shared';
import { ZodError } from 'zod';
import { AppError, NotFoundError } from './utils/errors';
import { env } from './config/env';
import { logger } from './utils/logger';
import type { ComparisonService } from './services/comparison-service';
import { LiveComparisonService, MemoryLiveStore } from '@smartcompare/live';
export function createApp(
  service: ComparisonService,
  options: { redis?: Redis; rateLimit?: number; health?: () => Promise<unknown> } = {},
) {
  const app = express();
  const live = new LiveComparisonService(new MemoryLiveStore());
  app.disable('x-powered-by');
  // Set an exact trusted proxy configuration only for your hosting topology.
  app.use(helmet());
  app.use(cors({ origin: env.CORS_ORIGIN.split(',').map((s) => s.trim()) }));
  app.use(express.json({ limit: '16kb' }));
  app.use((req, res, next) => {
    res.locals.requestId = randomUUID();
    res.setHeader('X-Request-ID', res.locals.requestId);
    next();
  });
  app.get('/health', async (_req, res) =>
    res.json({
      status: 'ok',
      mode: 'demo-and-experimental',
      browserEnabled: false,
      dependencies: await options.health?.(),
    }),
  );
  if (options.redis)
    app.use(
      '/api/v1/compare',
      rateLimit({
        windowMs: 60000,
        limit: options.rateLimit ?? 30,
        standardHeaders: false,
        legacyHeaders: false,
        message: {
          success: false,
          error: {
            code: 'RATE_LIMITED',
            message: 'Too many comparisons. Please try again in a minute.',
          },
        },
      }),
    );
  const limiter = rateLimit({
    passOnStoreError: !!options.redis,
    windowMs: 60000,
    limit: options.rateLimit ?? 30,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    ...(options.redis
      ? {
          store: new RedisStore({
            sendCommand: (...args: string[]) =>
              options.redis!.call(args[0]!, ...args.slice(1)) as Promise<
                number | string | (number | string)[]
              >,
            prefix: 'smartcompare:rate:',
          }),
        }
      : {}),
    message: {
      success: false,
      error: {
        code: 'RATE_LIMITED',
        message: 'Too many comparisons. Please try again in a minute.',
      },
    },
  });
  app.post(['/api/v1/compare', '/api/v1/compare/live'], limiter, async (req, res, next) => {
    try {
      const request = compareSchema.parse(req.body);
      let deadline: ReturnType<typeof setTimeout> | undefined;
      const response = await Promise.race([
        req.path.endsWith('/live')
          ? live.compare(request)
          : service.compare(request, res.locals.requestId),
        new Promise<never>((_, reject) => {
          deadline = setTimeout(
            () =>
              reject(
                new AppError(
                  'COMPARISON_TIMEOUT',
                  'The comparison took too long. Please try again.',
                  504,
                ),
              ),
            14500,
          );
        }),
      ]).finally(() => clearTimeout(deadline));
      res.setHeader('Cache-Control', 'no-store');
      res.json(response);
    } catch (error) {
      next(error);
    }
  });
  app.use((_req, _res, next) => next(new NotFoundError()));
  app.use(
    (error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
      const validation = error instanceof ZodError;
      const parserError = error as { type?: string; status?: number };
      const malformed = parserError.type === 'entity.parse.failed';
      const tooLarge = parserError.type === 'entity.too.large';
      const status =
        validation || malformed
          ? 400
          : tooLarge
            ? 413
            : error instanceof AppError
              ? error.status
              : 500;
      const code =
        validation || malformed
          ? 'VALIDATION_ERROR'
          : tooLarge
            ? 'REQUEST_TOO_LARGE'
            : error instanceof AppError
              ? error.code
              : 'INTERNAL_ERROR';
      const message =
        validation || malformed
          ? 'Check the product name, location and preference.'
          : tooLarge
            ? 'The request is too large.'
            : error instanceof AppError
              ? error.message
              : 'Something went wrong. Please try again.';
      if (status >= 500) logger.error({ requestId: res.locals.requestId, code }, 'request.failed');
      res
        .status(status)
        .json({ success: false, error: { code, message }, requestId: res.locals.requestId });
    },
  );
  return app;
}
