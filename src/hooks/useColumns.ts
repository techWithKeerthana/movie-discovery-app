import { useWindowDimensions } from 'react-native';

export const H_PADDING = 16;
export const GAP = 12;
const MIN_CARD = 150;

/**
 * Responsive grid maths, kept pure so it can be unit-tested. Columns grow with the window (2 on phones up to 6 on tablets,
 * landscape or split-screen) and card width fills the row exactly, so no device leaves a ragged gap on the right.
 */
export function computeLayout(width: number) {
  const inner = Math.max(0, width - 2 * H_PADDING);
  const columns = Math.max(2, Math.min(6, Math.floor((inner + GAP) / (MIN_CARD + GAP))));
  const cardWidth = Math.floor((inner - GAP * (columns - 1)) / columns);
  return { columns, cardWidth, gap: GAP, padding: H_PADDING };
}

/** Recomputes on rotation / window resize. */
export function useColumns() {
  const { width } = useWindowDimensions();
  return computeLayout(width);
}
