import { useEffect, useState, type ReactNode } from 'react';
import { ApiError } from '../api/client';

/** Placeholder cards with the SAME 2:3 poster box as real cards, so content loading in causes no layout shift. */
export function SkeletonGrid({ count = 12 }: { count?: number }) {
  return (
    <div className="grid" aria-hidden="true">
      {Array.from({ length: count }, (_, i) => (
        <div className="card skeleton" key={i}>
          <div className="poster shimmer" />
          <div className="card-info">
            <div className="line shimmer" />
            <div className="line short shimmer" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function EmptyState({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="state" role="status">
      <div className="state-icon" aria-hidden="true">
        🎞️
      </div>
      <h2>{title}</h2>
      {children && <p>{children}</p>}
      {action}
    </div>
  );
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const known = error instanceof ApiError ? error : null;
  const retryable = known ? known.retryable : true;
  const message =
    known?.code === 'NOT_FOUND'
      ? 'We could not find that.'
      : (known?.message ?? 'Something went wrong while loading this.');
  return (
    <div className="state error" role="alert">
      <div className="state-icon" aria-hidden="true">
        ⚠️
      </div>
      <h2>Something went wrong</h2>
      <p>{message}</p>
      {retryable && onRetry && (
        <button className="btn primary" onClick={onRetry}>
          Try again
        </button>
      )}
    </div>
  );
}

export function StaleBanner() {
  return (
    <div className="banner" role="status">
      The movie service is having trouble right now, so you are seeing saved results. They may be a little out of date.
    </div>
  );
}

/** True once `active` has stayed true for `ms` — used to reassure users on slow connections. */
export function useSlowHint(active: boolean, ms = 3000) {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    if (!active) {
      setSlow(false);
      return;
    }
    const t = setTimeout(() => setSlow(true), ms);
    return () => clearTimeout(t);
  }, [active, ms]);
  return slow;
}

export function SlowHint({ show }: { show: boolean }) {
  if (!show) return null;
  return (
    <p className="slow-hint" role="status">
      Still loading… this is taking longer than usual.
    </p>
  );
}
