import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import type { MovieDetail } from '@trackzio/shared';

interface CompareState {
  /** The first movie picked, while waiting for a second. Null once a pair is complete or nothing is picked. */
  selected: MovieDetail | null;
  /** Picks `movie`. Returns the OTHER movie when this completes a pair (caller navigates to Compare), else null. */
  pick: (movie: MovieDetail) => MovieDetail | null;
  clear: () => void;
}

const Ctx = createContext<CompareState | null>(null);

/** App-wide so the Compare button works across any two detail screens, and the banner shows from anywhere. */
export function CompareProvider({ children }: { children: ReactNode }) {
  const [selected, setSelected] = useState<MovieDetail | null>(null);

  const pick = useCallback(
    (movie: MovieDetail): MovieDetail | null => {
      if (selected && selected.id === movie.id) {
        setSelected(null); // tapping the already-selected movie cancels it
        return null;
      }
      if (selected) {
        const other = selected;
        setSelected(null); // pair complete; caller navigates, then the banner clears
        return other;
      }
      setSelected(movie);
      return null;
    },
    [selected],
  );

  const clear = useCallback(() => setSelected(null), []);
  const value = useMemo(() => ({ selected, pick, clear }), [selected, pick, clear]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useCompare(): CompareState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useCompare must be used within CompareProvider');
  return ctx;
}
