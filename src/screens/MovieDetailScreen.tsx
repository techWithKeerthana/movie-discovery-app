import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Image } from 'expo-image';
import { useCallback, useEffect } from 'react';
import { FlatList, Linking, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import type { MovieDetail, MovieSummary } from '@trackzio/shared';
import { toSummary } from '../api/movies';
import { MovieCard } from '../components/MovieCard';
import { PosterImage } from '../components/PosterImage';
import { useCompare } from '../components/CompareContext';
import { FadeIn } from '../components/FadeIn';
import { ErrorState, SkeletonBlock, SlowHint, StaleBanner, useSlowHint } from '../components/States';
import { useToast } from '../components/Toast';
import { useMovieDetail } from '../hooks/queries';
import { useRecordRecentlyViewed } from '../hooks/useRecentlyViewed';
import { useToggleWishlist, useWishlist } from '../hooks/useWishlist';
import type { RootStackParamList } from '../navigation/types';
import { colors, radius, TOUCH } from '../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'MovieDetail'>;

const runtime = (m: number) => (m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`);

export function MovieDetailScreen({ route, navigation }: Props) {
  const { id } = route.params;
  const { data, isPending, isError, error, refetch } = useMovieDetail(id);
  const slow = useSlowHint(isPending);
  const toast = useToast();
  const { width } = useWindowDimensions();
  const wide = width >= 700;
  const recordViewed = useRecordRecentlyViewed();

  const title = data?.data.title;
  useEffect(() => {
    if (title) navigation.setOptions({ title });
  }, [title, navigation]);

  // "Opened" means the detail actually loaded, not just that a card was tapped.
  useEffect(() => {
    if (data) recordViewed(toSummary(data.data));
  }, [data, recordViewed]);

  if (isPending) {
    return (
      <View style={styles.pad}>
        <SlowHint show={slow} />
        <View style={styles.skeletonRow}>
          <View style={{ width: 140 }}>
            <SkeletonBlock height={210} />
          </View>
          <View style={{ flex: 1, gap: 10 }}>
            <SkeletonBlock height={28} width="80%" />
            <SkeletonBlock height={14} width="50%" />
            <SkeletonBlock height={14} />
            <SkeletonBlock height={14} />
          </View>
        </View>
      </View>
    );
  }
  if (isError) return <ErrorState error={error} onRetry={() => refetch()} />;

  const m = data.data;
  const facts = [m.year, m.runtimeMinutes ? runtime(m.runtimeMinutes) : null, m.status].filter((f): f is string | number => Boolean(f));

  const openTrailer = () => {
    Linking.openURL(`https://www.youtube.com/watch?v=${encodeURIComponent(m.trailerKey ?? '')}`).catch(() => toast('Could not open the trailer.'));
  };

  return (
    <FadeIn style={styles.fade}>
    <ScrollView contentContainerStyle={styles.scroll}>
      {data.stale && <StaleBanner />}
      <View style={styles.hero}>
        {m.backdropUrl ? <Image source={{ uri: m.backdropUrl }} style={styles.backdrop} contentFit="cover" /> : null}
        <View style={[styles.heroMain, wide && { flexDirection: 'row' }]}>
          <PosterImage url={m.posterUrl} title={m.title} style={[styles.poster, wide ? { width: 240 } : { width: '55%', maxWidth: 240, alignSelf: 'center' }]} />
          <View style={styles.heroText}>
            <Text style={styles.title} accessibilityRole="header">
              {m.title}
            </Text>
            {m.tagline ? <Text style={styles.tagline}>{m.tagline}</Text> : null}
            <View style={styles.facts}>
              {m.rating !== null && (
                <Text style={styles.rating}>
                  ★ {m.rating.toFixed(1)} <Text style={styles.votes}>({m.voteCount.toLocaleString()} votes)</Text>
                </Text>
              )}
              {facts.map((f) => (
                <Text key={String(f)} style={styles.fact}>
                  {f}
                </Text>
              ))}
            </View>
            {m.genres.length > 0 && (
              <View style={styles.genres}>
                {m.genres.map((g) => (
                  <Pressable
                    key={g.id}
                    accessibilityRole="button"
                    accessibilityLabel={`Browse ${g.name} movies`}
                    style={styles.genre}
                    onPress={() => navigation.navigate('Tabs', { screen: 'Discover', params: { genre: g.id, nonce: Date.now() } })}
                  >
                    <Text style={styles.genreText}>{g.name}</Text>
                  </Pressable>
                ))}
              </View>
            )}
            <Text style={styles.h2}>Overview</Text>
            <Text style={styles.overview}>{m.overview || 'No overview is available for this movie yet.'}</Text>
            <View style={styles.actions}>
              <WishlistButton movie={m} />
              <CompareButton movie={m} navigation={navigation} />
              {m.trailerKey ? (
                <Pressable style={styles.btn} onPress={openTrailer} accessibilityRole="button" accessibilityLabel="Watch trailer">
                  <Text style={styles.btnText}>▶ Watch trailer</Text>
                </Pressable>
              ) : null}
            </View>
          </View>
        </View>
      </View>

      {m.cast.length > 0 && (
        <View>
          <Text style={[styles.h2, styles.padH]}>Cast</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.cast}>
            {m.cast.map((c) => (
              <View key={c.id} style={styles.castItem}>
                <View style={styles.avatar}>
                  {c.profileUrl ? (
                    <Image source={{ uri: c.profileUrl }} style={StyleSheet.absoluteFill} contentFit="cover" />
                  ) : (
                    <Text style={styles.avatarLetter}>{c.name[0]}</Text>
                  )}
                </View>
                <Text style={styles.castName} numberOfLines={1}>
                  {c.name}
                </Text>
                {c.character ? (
                  <Text style={styles.castRole} numberOfLines={1}>
                    {c.character}
                  </Text>
                ) : null}
              </View>
            ))}
          </ScrollView>
        </View>
      )}

      {m.similar.length > 0 && <SimilarRow movies={m.similar} onOpen={(s) => navigation.push('MovieDetail', { id: s.id, title: s.title })} />}
    </ScrollView>
    </FadeIn>
  );
}

function WishlistButton({ movie }: { movie: MovieDetail }) {
  const { ids } = useWishlist();
  const { mutate } = useToggleWishlist();
  const wished = ids.has(movie.id);
  return (
    <Pressable
      onPress={() => mutate({ movie: toSummary(movie), add: !wished })}
      accessibilityRole="button"
      accessibilityLabel={wished ? 'Remove from wishlist' : 'Add to wishlist'}
      accessibilityState={{ selected: wished }}
      style={[styles.btn, wished ? styles.btnWished : styles.btnPrimary]}
    >
      <Text style={[styles.btnText, !wished && { color: colors.accentInk }]}>{wished ? '♥ In your wishlist' : '♡ Add to wishlist'}</Text>
    </Pressable>
  );
}

function CompareButton({ movie, navigation }: { movie: MovieDetail; navigation: Props['navigation'] }) {
  const { selected, pick } = useCompare();
  const isSelected = selected?.id === movie.id;
  return (
    <Pressable
      onPress={() => {
        const other = pick(movie);
        if (other) navigation.navigate('Compare', { a: other, b: movie });
      }}
      accessibilityRole="button"
      accessibilityLabel={isSelected ? `Cancel comparing ${movie.title}` : `Compare ${movie.title}`}
      accessibilityState={{ selected: isSelected }}
      style={[styles.btn, isSelected && styles.btnWished]}
    >
      <Text style={styles.btnText}>{isSelected ? '✕ Comparing' : '⇄ Compare'}</Text>
    </Pressable>
  );
}

function SimilarRow({ movies, onOpen }: { movies: MovieSummary[]; onOpen: (m: MovieSummary) => void }) {
  const { ids } = useWishlist();
  const { mutate } = useToggleWishlist();
  const onToggle = useCallback((movie: MovieSummary, add: boolean) => mutate({ movie, add }), [mutate]);
  return (
    <View>
      <Text style={[styles.h2, styles.padH]}>More like this</Text>
      <FlatList
        horizontal
        data={movies}
        keyExtractor={(m) => String(m.id)}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.similar}
        renderItem={({ item }) => <MovieCard movie={item} width={140} wished={ids.has(item.id)} onOpen={onOpen} onToggle={onToggle} />}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  pad: { padding: 16, gap: 12 },
  fade: { flex: 1 },
  skeletonRow: { flexDirection: 'row', gap: 16 },
  scroll: { paddingBottom: 32 },
  padH: { paddingHorizontal: 16 },
  hero: { margin: 16, borderRadius: radius, overflow: 'hidden', backgroundColor: colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  backdrop: { ...StyleSheet.absoluteFill, opacity: 0.18 },
  heroMain: { padding: 16, gap: 16 },
  poster: { borderRadius: radius },
  heroText: { flex: 1, minWidth: 0 },
  title: { color: colors.text, fontSize: 26, fontWeight: '800', lineHeight: 32 },
  tagline: { color: colors.muted, fontStyle: 'italic', marginTop: 4 },
  facts: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 14, rowGap: 4, marginTop: 10 },
  fact: { color: colors.muted },
  rating: { color: colors.accent, fontWeight: '700' },
  votes: { color: colors.muted, fontWeight: '400', fontSize: 12 },
  genres: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  genre: { minHeight: TOUCH - 8, paddingHorizontal: 14, borderRadius: 999, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.bg, justifyContent: 'center' },
  genreText: { color: colors.text },
  h2: { color: colors.text, fontSize: 18, fontWeight: '700', marginTop: 18, marginBottom: 6 },
  overview: { color: colors.text, fontSize: 15, lineHeight: 22 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 18 },
  btn: { minHeight: TOUCH, paddingHorizontal: 18, borderRadius: 10, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface2, alignItems: 'center', justifyContent: 'center' },
  btnPrimary: { backgroundColor: colors.accent, borderColor: colors.accent },
  btnWished: { backgroundColor: '#3a2230', borderColor: colors.danger },
  btnText: { color: colors.text, fontWeight: '700' },
  cast: { gap: 14, paddingHorizontal: 16 },
  castItem: { width: 84, alignItems: 'center', gap: 2 },
  avatar: { width: 68, height: 68, borderRadius: 34, overflow: 'hidden', backgroundColor: colors.surface2, alignItems: 'center', justifyContent: 'center' },
  avatarLetter: { color: colors.muted, fontWeight: '700', fontSize: 20 },
  castName: { color: colors.text, fontSize: 12, fontWeight: '600', maxWidth: 84 },
  castRole: { color: colors.muted, fontSize: 11, maxWidth: 84 },
  similar: { gap: 12, paddingHorizontal: 16 },
});
