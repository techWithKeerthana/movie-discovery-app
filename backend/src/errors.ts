import type { ErrorCode } from '@trackzio/shared';

const STATUS: Record<ErrorCode, number> = {
  BAD_REQUEST: 400,
  NOT_FOUND: 404,
  RATE_LIMITED: 429,
  UPSTREAM_TIMEOUT: 504,
  UPSTREAM_UNAVAILABLE: 503,
  UPSTREAM_INVALID: 502,
  INTERNAL: 500,
};

const RETRYABLE: ReadonlySet<ErrorCode> = new Set([
  'UPSTREAM_TIMEOUT',
  'UPSTREAM_UNAVAILABLE',
  'RATE_LIMITED',
]);

/** Single error type the whole backend throws; the error middleware turns it into the API error contract. */
export class AppError extends Error {
  readonly status: number;
  readonly retryable: boolean;
  constructor(
    readonly code: ErrorCode,
    message: string,
  ) {
    super(message);
    this.status = STATUS[code];
    this.retryable = RETRYABLE.has(code);
  }
}
