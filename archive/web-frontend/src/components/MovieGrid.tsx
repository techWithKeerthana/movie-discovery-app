import { useCallback, useEffect, useRef } from 'react';
import type { MovieSummary } from '@trackzio/shared';
import { useToggleWishlist, useWishlist } from '../hooks/useWishlist';
import { MovieCard } from './MovieCard';

/** Grid that owns the wishlist wiring once, so each card gets plain props (and can be memoised). */
export function MovieGrid({ movies, dim = false }: { movies: MovieSummary[]; dim?: boolean }) {
  const { has } = useWishlist();
  const { mutate } = useToggleWishlist();
  const onToggle = useCallback((movie: MovieSummary, add: boolean) => mutate({ movie, add }), [mutate]);
  return (
    <div className={`grid ${dim ? 'dim' : ''}`} aria-busy={dim}>
      {movies.map((m) => (
        <MovieCard key={m.id} movie={m} wished={has(m.id)} onToggle={onToggle} />
      ))}
    </div>
  );
}

/** Fires `onVisible` when scrolled near the bottom (pre-loads 800px early so scrolling feels endless). */
export function InfiniteSentinel({ onVisible, disabled }: { onVisible: () => void; disabled: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const cb = useRef(onVisible);
  cb.current = onVisible;

  useEffect(() => {
    const el = ref.current;
    if (!el || disabled || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver((entries) => entries[0]?.isIntersecting && cb.current(), { rootMargin: '800px' });
    io.observe(el);
    return () => io.disconnect();
  }, [disabled]);

  return <div ref={ref} className="sentinel" aria-hidden="true" />;
}
