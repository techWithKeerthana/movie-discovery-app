import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import type { MovieDetail } from '@trackzio/shared';
import { PosterImage } from '../components/PosterImage';
import type { RootStackParamList } from '../navigation/types';
import { colors, radius } from '../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'Compare'>;

const runtime = (m: number) => (m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`);

export function CompareScreen({ route }: Props) {
  const { a, b } = route.params;
  return (
    <ScrollView contentContainerStyle={styles.scroll}>
      <View style={styles.row}>
        <Column movie={a} />
        <Column movie={b} />
      </View>
    </ScrollView>
  );
}

function Column({ movie }: { movie: MovieDetail }) {
  return (
    <View style={styles.col}>
      <PosterImage url={movie.posterUrl} title={movie.title} style={styles.poster} />
      <Text style={styles.title} numberOfLines={2}>
        {movie.title}
      </Text>
      <Fact label="Rating" value={movie.rating !== null ? `★ ${movie.rating.toFixed(1)}` : '—'} />
      <Fact label="Release year" value={movie.year !== null ? String(movie.year) : '—'} />
      <Fact label="Runtime" value={movie.runtimeMinutes !== null ? runtime(movie.runtimeMinutes) : '—'} />
      <Fact label="Genres" value={movie.genres.length > 0 ? movie.genres.map((g) => g.name).join(', ') : '—'} />
      <Text style={styles.factLabel}>Overview</Text>
      <Text style={styles.overview} numberOfLines={5}>
        {movie.overview || 'No overview available.'}
      </Text>
    </View>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.fact} accessibilityLabel={`${label}: ${value}`}>
      <Text style={styles.factLabel}>{label}</Text>
      <Text style={styles.factValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: 16 },
  row: { flexDirection: 'row', gap: 12 },
  col: { flex: 1, backgroundColor: colors.surface, borderColor: colors.border, borderWidth: StyleSheet.hairlineWidth, borderRadius: radius, padding: 10, gap: 8, minWidth: 0 },
  poster: { borderRadius: 8 },
  title: { color: colors.text, fontSize: 15, fontWeight: '700', minHeight: 38 },
  fact: { gap: 1 },
  factLabel: { color: colors.muted, fontSize: 11 },
  factValue: { color: colors.text, fontSize: 13, fontWeight: '600' },
  overview: { color: colors.text, fontSize: 12, lineHeight: 17 },
});
