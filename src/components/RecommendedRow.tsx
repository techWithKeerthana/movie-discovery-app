import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import type { MovieSummary } from '@trackzio/shared';
import { colors } from '../theme';
import { PosterImage } from './PosterImage';

const WIDTH = 110;

/** Shown above the Discover grid once the wishlist has enough movies to infer a favourite genre from. */
export function RecommendedRow({ movies, onOpen }: { movies: MovieSummary[]; onOpen: (m: MovieSummary) => void }) {
  if (movies.length === 0) return null;
  return (
    <View style={styles.section}>
      <Text style={styles.h2}>Because you liked...</Text>
      <FlatList
        horizontal
        data={movies}
        keyExtractor={(m) => String(m.id)}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.row}
        renderItem={({ item }) => (
          <Pressable
            onPress={() => onOpen(item)}
            accessibilityRole="button"
            accessibilityLabel={`${item.title}, recommended`}
            style={({ pressed }) => [styles.item, pressed && styles.pressed]}
          >
            <PosterImage url={item.posterUrl} title={item.title} style={styles.poster} />
            <Text style={styles.title} numberOfLines={2}>
              {item.title}
            </Text>
          </Pressable>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: 8 },
  h2: { color: colors.text, fontSize: 16, fontWeight: '700' },
  row: { gap: 12 },
  item: { width: WIDTH },
  pressed: { opacity: 0.85 },
  poster: { width: WIDTH, borderRadius: 8 },
  title: { color: colors.muted, fontSize: 12, marginTop: 4, minHeight: 30 },
});
