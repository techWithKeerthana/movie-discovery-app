import { useEffect, useRef, useState } from 'react';
import { SORT_OPTIONS, type Genre, type SortOption } from '@trackzio/shared';
import type { Filters } from '../hooks/useFilters';
import { useDebouncedValue } from '../hooks/useDebouncedValue';

type Update = (patch: Partial<Record<keyof Filters, string | number | undefined>>) => void;

export function SearchBox({ value, onChange }: { value: string; onChange: (q: string) => void }) {
  const [text, setText] = useState(value);
  const debounced = useDebouncedValue(text, 300);
  const lastSent = useRef(value);

  // typing -> (300ms pause) -> URL. Rapid keystrokes therefore produce ONE request, not one per key.
  useEffect(() => {
    const q = debounced.trim();
    if (q !== lastSent.current) {
      lastSent.current = q;
      onChange(q);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced]);

  // URL -> input, for changes we did not make ourselves (back button, "clear filters").
  useEffect(() => {
    if (value !== lastSent.current) {
      lastSent.current = value;
      setText(value);
    }
  }, [value]);

  return (
    <form
      className="search"
      role="search"
      onSubmit={(e) => {
        e.preventDefault();
        const q = text.trim();
        lastSent.current = q;
        onChange(q); // Enter skips the debounce
      }}
    >
      <input
        type="search"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Search movies…"
        aria-label="Search movies"
        maxLength={100}
        enterKeyHint="search"
      />
    </form>
  );
}

const THIS_YEAR = new Date().getFullYear();
const YEARS = Array.from({ length: THIS_YEAR + 1 - 1929 }, (_, i) => THIS_YEAR + 1 - i);

interface Props {
  filters: Filters;
  /** A text search is active: TMDB orders those results by relevance and cannot sort them. */
  searching: boolean;
  genres: Genre[] | undefined;
  update: Update;
  onReset: () => void;
  canReset: boolean;
}

export function FilterBar({ filters, searching, genres, update, onReset, canReset }: Props) {
  return (
    <div className="filters">
      {genres && genres.length > 0 && (
        <div className="chips" role="group" aria-label="Genres">
          <button className={`chip ${!filters.genre ? 'on' : ''}`} aria-pressed={!filters.genre} onClick={() => update({ genre: undefined })}>
            All
          </button>
          {genres.map((g) => (
            <button
              key={g.id}
              className={`chip ${filters.genre === g.id ? 'on' : ''}`}
              aria-pressed={filters.genre === g.id}
              onClick={() => update({ genre: filters.genre === g.id ? undefined : g.id })}
            >
              {g.name}
            </button>
          ))}
        </div>
      )}
      <div className="selects">
        <label>
          <span>Year</span>
          <select value={filters.year ?? ''} onChange={(e) => update({ year: e.target.value || undefined })}>
            <option value="">Any</option>
            {YEARS.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Min rating</span>
          <select value={filters.minRating ?? ''} onChange={(e) => update({ minRating: e.target.value || undefined })}>
            <option value="">Any</option>
            {[5, 6, 7, 8, 9].map((r) => (
              <option key={r} value={r}>
                {r}+ ★
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Sort by</span>
          {searching ? (
            // The URL may still hold a sort (kept so it comes back when the search is cleared), but while
            // searching only relevance is meaningful, so it is the only choice.
            <select value="popularity.desc" disabled title="Search results are ordered by relevance">
              <option value="popularity.desc">Relevance</option>
            </select>
          ) : (
            <select value={filters.sort} onChange={(e) => update({ sort: e.target.value as SortOption })}>
              {SORT_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          )}
        </label>
        {canReset && (
          <button className="btn ghost" onClick={onReset}>
            Clear all
          </button>
        )}
      </div>
    </div>
  );
}
