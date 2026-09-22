import type { ErrorRequestHandler, RequestHandler } from 'express';
import { ZodError } from 'zod';
import type { ApiErrorBody } from '@trackzio/shared';
import { AppError } from '../errors.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

declare module 'express-serve-static-core' {
  interface Request {
    deviceId?: string;
  }
}

/** Wishlist ownership: an anonymous, client-generated UUID sent as X-Device-Id (no accounts in scope). */
export const requireDeviceId: RequestHandler = (req, _res, next) => {
  const id = req.header('x-device-id');
  if (!id || !UUID.test(id)) return next(new AppError('BAD_REQUEST', 'Missing or invalid X-Device-Id header'));
  req.deviceId = id.toLowerCase();
  next();
};

/** Drops empty-string query params (`?genre=`) so optional filters behave as "not set". */
export function cleanQuery(q: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(q).filter(([, v]) => v !== '' && v !== undefined));
}

export const notFound: RequestHandler = (_req, _res, next) => next(new AppError('NOT_FOUND', 'Route not found'));

/** The single place errors become HTTP responses, always in the ApiErrorBody shape. */
export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  let app: AppError;
  if (err instanceof AppError) app = err;
  else if (err instanceof ZodError) {
    app = new AppError('BAD_REQUEST', err.issues.map((i) => `${i.path.join('.') || 'request'}: ${i.message}`).join('; '));
  } else if (err?.type === 'entity.parse.failed' || err?.type === 'entity.too.large') {
    app = new AppError('BAD_REQUEST', 'Invalid request body');
  } else {
    console.error('[unhandled]', err);
    app = new AppError('INTERNAL', 'Something went wrong');
  }
  const body: ApiErrorBody = { error: { code: app.code, message: app.message, retryable: app.retryable } };
  res.status(app.status).json(body);
};
