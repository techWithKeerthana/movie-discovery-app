import { useNavigation, useScrollToTop } from '@react-navigation/native';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { SORT_OPTIONS, type MovieSummary } from '@trackzio/shared';
import { FadeIn } from '../components/FadeIn';
import { GenreChips } from '../components/GenreChips';
import { MovieList } from '../components/MovieList';
import { OptionPicker, type Option } from '../components/OptionPicker';
import { RecentlyViewedRow } from '../components/RecentlyViewedRow';
import { SearchBar } from '../components/SearchBar';
import { Button, EmptyState, ErrorState, InlineError, SkeletonGrid, SlowHint, StaleBanner, useSlowHint } from '../components/States';
import { H_PADDING } from '../hooks/useColumns';
import { useGenres, useMovieList, type Filters } from '../hooks/queries';
import { useRecentlyViewed } from '../hooks/useRecentlyViewed';
import type { RootStackParamList, TabParamList } from '../navigation/types';
import { colors } from '../theme';

const TMDB_PAGE_CAP = 500;
const INITIAL: Filters = { q: '', sort: 'popularity.desc' };

const THIS_YEAR = new Date().getFullYear();
const YEAR_OPTIONS: Option<number>[] = [
  { value: undefined, label: 'Any' },
  ...Array.from({ length: THIS_YEAR + 1 - 1929 }, (_, i) => ({ value: THIS_YEAR + 1 - i, label: String(THIS_YEAR + 1 - i) })),
];
const RATING_OPTIONS: Option<number>[] = [{ value: undefined, label: 'Any' }, ...[5, 6, 7, 8, 9].map((r) => ({ value: r, label: `${r}+ ★` }))];
const SORT_PICKER_OPTIONS: Option<string>[] = SORT_OPTIONS.map((o) => ({ value: o.value, label: o.label }));

/**
 * Browse / search / filter. Filters live in component state: the tab navigator keeps this screen mounted while a movie is
 * open on top of it, so the state (and the list's scroll offset) survives Back without any persistence machinery.
 */
export function DiscoverScreen({ route }: BottomTabScreenProps<TabParamList, 'Discover'>) {
  const [filters, setFilters] = useState<Filters>(INITIAL);
  const listRef = useRef<FlatList<MovieSummary>>(null);
  useScrollToTop(listRef); // tapping the active tab scrolls back to the top
  const recentlyViewed = useRecentlyViewed();
  const rootNavigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  const searching = Boolean(filters.q);
  // While searching, sort is always relevance (TMDB cannot sort search results). The chosen sort is kept in state so it
  // comes back when the search is cleared.
  const requestFilters = useMemo<Filters>(() => (searching ? { ...filters, sort: 'popularity.desc' } : filters), [filters, searching]);
  const { query, items, totalResults, stale } = useMovieList(requestFilters);
  const genres = useGenres();

  const update = useCallback((patch: Partial<Filters>) => {
    setFilters((f) => ({ ...f, ...patch }));
    listRef.current?.scrollToOffset({ offset: 0, animated: false }); // a new list starts at the top
  }, []);
  const reset = useCallback(() => update({ ...INITIAL, genre: undefined, year: undefined, minRating: undefined }), [update]);

  // "Jump to genre" from the movie detail screen.
  const genreParam = route.params?.genre;
  const nonce = route.params?.nonce;
  useEffect(() => {
    if (genreParam !== undefined) update({ genre: genreParam });
  }, [genreParam, nonce, update]);

  const active = Boolean(filters.q || filters.genre || filters.year || filters.minRating || filters.sort !== 'popularity.desc');
  const { data, isPending, isError, error, isPlaceholderData, isFetching, isFetchingNextPage, isFetchNextPageError, hasNextPage, fetchNextPage, refetch, isRefetching } = query;
  const slow = useSlowHint(isPending || (isFetching && isPlaceholderData));

  const lastPage = data?.pages.at(-1);
  // A search+filter page can legitimately come back empty. Do not auto-chain through hundreds of empty pages: only
  // auto-load while pages are yielding results, otherwise offer a button.
  const lastPageHadItems = (lastPage?.data.items.length ?? 0) > 0;
  const heading = filters.q ? `Results for “${filters.q}”` : filters.genre || filters.year || filters.minRating ? 'Filtered movies' : 'Discover movies';
  // Genre/rating refine each page of SEARCH results, so the backend's total (all matches) would overstate the count.
  const searchFilterCaveat = Boolean(filters.q && (filters.genre || filters.minRating));

  const onEndReached = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage && !isFetchNextPageError && !isPlaceholderData && lastPageHadItems) fetchNextPage();
  }, [hasNextPage, isFetchingNextPage, isFetchNextPageError, isPlaceholderData, lastPageHadItems, fetchNextPage]);

  const header = (
    <View style={styles.header}>
      <RecentlyViewedRow movies={recentlyViewed} onOpen={(m) => rootNavigation.navigate('MovieDetail', { id: m.id, title: m.title })} />
      <GenreChips genres={genres.data} selected={filters.genre} onSelect={(genre) => update({ genre })} />
      <View style={styles.pickers}>
        <OptionPicker
          label="Sort by"
          options={SORT_PICKER_OPTIONS}
          value={searching ? 'popularity.desc' : filters.sort}
          onChange={(v) => update({ sort: (v ?? 'popularity.desc') as Filters['sort'] })}
          disabled={searching}
          displayOverride={searching ? 'Relevance' : undefined}
        />
        <OptionPicker label="Year" options={YEAR_OPTIONS} value={filters.year} onChange={(year) => update({ year })} />
        <OptionPicker label="Min rating" options={RATING_OPTIONS} value={filters.minRating} onChange={(minRating) => update({ minRating })} />
      </View>
      {active && <Button label="Clear search and filters" onPress={reset} />}
      {stale && <StaleBanner />}
      {isError && data && !isFetchNextPageError && <InlineError message="Could not refresh results." onRetry={() => refetch()} />}
      <View style={styles.headRow}>
        <Text style={styles.h1} accessibilityRole="header">
          {heading}
        </Text>
        {!isPending && items.length > 0 && !searchFilterCaveat && <Text style={styles.count}>{totalResults.toLocaleString()} movies</Text>}
      </View>
      {searchFilterCaveat && (
        <Text style={styles.note}>Genre and rating filters are applied to each page of search results as it loads, so the total is not shown.</Text>
      )}
      <SlowHint show={slow} />
    </View>
  );

  let empty: React.ReactElement | null = null;
  if (isPending) empty = <SkeletonGrid />;
  else if (isError && !data) empty = <ErrorState error={error} onRetry={() => refetch()} />;
  else if (items.length === 0 && hasNextPage)
    empty = (
      <View style={styles.centerBlock}>
        <Text style={styles.note}>No matches on this page of results.</Text>
        <Button label="Check the next page" onPress={() => fetchNextPage()} />
      </View>
    );
  else if (items.length === 0)
    empty = (
      <EmptyState
        title="No movies found"
        action={active ? <Button primary label="Clear search and filters" onPress={reset} /> : undefined}
      >
        {filters.q ? `Nothing matched “${filters.q}”. Check the spelling or try a different title.` : 'Try loosening your filters.'}
      </EmptyState>
    );

  const footer =
    items.length > 0 ? (
      <View>
        {isFetchingNextPage && <SkeletonGrid count={2} />}
        {isFetchNextPageError && <InlineError message="Could not load more movies." onRetry={() => fetchNextPage()} />}
        {hasNextPage && !isFetchingNextPage && !isFetchNextPageError && !lastPageHadItems && (
          <View style={styles.centerBlock}>
            <Text style={styles.note}>No matches on this page of results.</Text>
            <Button label="Check the next page" onPress={() => fetchNextPage()} />
          </View>
        )}
        {!hasNextPage && (
          <Text style={styles.endNote}>
            {lastPage && lastPage.data.page >= TMDB_PAGE_CAP
              ? 'That is as far as the movie database lets us go for this view. Narrow your filters to see more.'
              : "You've reached the end."}
          </Text>
        )}
      </View>
    ) : null;

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <View style={styles.searchRow}>
        <SearchBar value={filters.q} onChange={(q) => update({ q })} />
      </View>
      <FadeIn ready={!isPending} style={styles.fade}>
        <MovieList
          testID="discover-list"
          listRef={listRef}
          data={items}
          header={header}
          empty={empty}
          footer={footer}
          onEndReached={onEndReached}
          refreshing={isRefetching && !isFetchingNextPage && !isPlaceholderData}
          onRefresh={() => refetch()}
          dim={isPlaceholderData}
        />
      </FadeIn>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  fade: { flex: 1 },
  searchRow: { paddingHorizontal: H_PADDING, paddingTop: 8, paddingBottom: 8 },
  header: { gap: 12, paddingBottom: 12 },
  pickers: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  headRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' },
  h1: { color: colors.text, fontSize: 22, fontWeight: '700', flexShrink: 1 },
  count: { color: colors.muted, fontSize: 13 },
  note: { color: colors.muted, fontSize: 13 },
  endNote: { color: colors.muted, textAlign: 'center', paddingVertical: 24 },
  centerBlock: { alignItems: 'center', gap: 8, paddingVertical: 24 },
});
