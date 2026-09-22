import { Ionicons } from '@expo/vector-icons';
import { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { MovieSummary } from '@trackzio/shared';
import { colors, radius, TOUCH } from '../theme';
import { PosterImage } from './PosterImage';

interface Props {
  movie: MovieSummary;
  width: number;
  wished: boolean;
  onOpen: (movie: MovieSummary) => void;
  onToggle: (movie: MovieSummary, add: boolean) => void;
}

/** memo'd with stable callbacks: in a long list, toggling one heart must not re-render every card. */
export const MovieCard = memo(function MovieCard({ movie, width, wished, onOpen, onToggle }: Props) {
  return (
    <View style={[styles.card, { width }]}>
      <Pressable
        onPress={() => onOpen(movie)}
        accessibilityRole="button"
        accessibilityLabel={`${movie.title}, ${movie.year ?? 'release date unknown'}${movie.rating !== null ? `, rated ${movie.rating.toFixed(1)}` : ''}`}
        style={({ pressed }) => pressed && styles.pressed}
      >
        <PosterImage url={movie.posterUrl} title={movie.title} />
        <View style={styles.info}>
          {/* Clamped to two lines, and two lines are always reserved, so short and long titles give equal-height cards. */}
          <Text style={styles.title} numberOfLines={2} ellipsizeMode="tail">
            {movie.title}
          </Text>
          <View style={styles.meta}>
            <Text style={styles.year}>{movie.year ?? 'TBA'}</Text>
            {movie.rating !== null && <Text style={styles.rating}>★ {movie.rating.toFixed(1)}</Text>}
          </View>
        </View>
      </Pressable>
      {/* Sibling of the card Pressable, not a child: nested touchables fight over the gesture. */}
      <Pressable
        onPress={() => onToggle(movie, !wished)}
        hitSlop={4}
        accessibilityRole="button"
        accessibilityLabel={wished ? `Remove ${movie.title} from wishlist` : `Add ${movie.title} to wishlist`}
        accessibilityState={{ selected: wished }}
        style={styles.heart}
      >
        <Ionicons name={wished ? 'heart' : 'heart-outline'} size={22} color={wished ? colors.danger : '#fff'} />
      </Pressable>
    </View>
  );
});

const styles = StyleSheet.create({
  card: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: StyleSheet.hairlineWidth, borderRadius: radius, overflow: 'hidden' },
  pressed: { opacity: 0.85 },
  info: { padding: 10 },
  title: { color: colors.text, fontSize: 14, fontWeight: '600', lineHeight: 18, minHeight: 36 },
  meta: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 },
  year: { color: colors.muted, fontSize: 12 },
  rating: { color: colors.accent, fontSize: 12, fontWeight: '600' },
  heart: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: TOUCH - 4,
    height: TOUCH - 4,
    borderRadius: (TOUCH - 4) / 2,
    backgroundColor: 'rgba(15,17,21,0.75)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
