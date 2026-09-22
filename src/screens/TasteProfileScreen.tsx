import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { MovieSummary } from '@trackzio/shared';
import { useGenres } from '../hooks/queries';
import { useRecentlyViewed } from '../hooks/useRecentlyViewed';
import { useWishlist } from '../hooks/useWishlist';
import { colors, radius } from '../theme';

/** Most-saved genres first, ties broken by insertion (Map preserves first-seen order). */
function topGenres(items: MovieSummary[], limit = 3): [number, number][] {
  const counts = new Map<number, number>();
  for (const m of items) for (const g of m.genreIds) counts.set(g, (counts.get(g) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit);
}

/**
 * Entirely client-side: derived from the wishlist (useWishlist) and the locally-tracked "recently viewed" list
 * (useRecentlyViewed), no backend call. Genre id -> name comes from the already-cached /genres query.
 */
export function TasteProfileScreen() {
  const { items } = useWishlist();
  const recentlyViewed = useRecentlyViewed();
  const genres = useGenres();

  const rated = items.filter((m) => m.rating !== null);
  const avgRating = rated.length > 0 ? rated.reduce((sum, m) => sum + m.rating!, 0) / rated.length : null;
  const genreCounts = topGenres(items);
  const maxCount = genreCounts[0]?.[1] ?? 1;
  const nameOf = (id: number) => genres.data?.find((g) => g.id === id)?.name ?? `Genre ${id}`;

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.statsRow}>
          <Stat label="Movies watched" value={recentlyViewed.length} />
          <Stat label="Movies saved" value={items.length} />
          <Stat label="Avg rating" value={avgRating !== null ? `★ ${avgRating.toFixed(1)}` : '—'} />
        </View>

        <Text style={styles.h2}>Favorite genres</Text>
        {genreCounts.length === 0 ? (
          <Text style={styles.note}>Save a few movies to see your favorite genres here.</Text>
        ) : (
          <View style={styles.bars}>
            {genreCounts.map(([id, count]) => (
              <View key={id} style={styles.barRow}>
                <Text style={styles.barLabel} numberOfLines={1}>
                  {nameOf(id)}
                </Text>
                <View style={styles.barTrack} accessibilityLabel={`${nameOf(id)}: ${count} saved`}>
                  <View style={[styles.barFill, { width: `${(count / maxCount) * 100}%` }]} />
                </View>
                <Text style={styles.barCount}>{count}</Text>
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <View style={styles.stat} accessibilityLabel={`${label}: ${value}`}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  scroll: { padding: 16, gap: 20 },
  statsRow: { flexDirection: 'row', gap: 10 },
  stat: { flex: 1, backgroundColor: colors.surface, borderColor: colors.border, borderWidth: StyleSheet.hairlineWidth, borderRadius: radius, padding: 14, alignItems: 'center', gap: 4 },
  statValue: { color: colors.accent, fontSize: 20, fontWeight: '800' },
  statLabel: { color: colors.muted, fontSize: 12, textAlign: 'center' },
  h2: { color: colors.text, fontSize: 18, fontWeight: '700', marginTop: 4, marginBottom: 4 },
  note: { color: colors.muted, fontSize: 14 },
  bars: { gap: 12 },
  barRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  barLabel: { color: colors.text, width: 90, fontSize: 13 },
  barTrack: { flex: 1, height: 14, borderRadius: 7, backgroundColor: colors.surface2, overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: 7, backgroundColor: colors.accent },
  barCount: { color: colors.muted, fontSize: 13, width: 24, textAlign: 'right' },
});
