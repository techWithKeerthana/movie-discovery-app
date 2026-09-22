import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useCallback, type ReactElement, type Ref } from 'react';
import { Animated, FlatList, RefreshControl, StyleSheet, View, type ListRenderItem } from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';
import type { MovieSummary } from '@trackzio/shared';
import { useColumns } from '../hooks/useColumns';
import { useToggleWishlist, useWishlist } from '../hooks/useWishlist';
import type { RootStackParamList } from '../navigation/types';
import { colors, radius } from '../theme';
import { MovieCard } from './MovieCard';

interface Props {
  data: MovieSummary[];
  header?: ReactElement | null;
  empty?: ReactElement | null;
  footer?: ReactElement | null;
  onEndReached?: () => void;
  refreshing?: boolean;
  onRefresh?: () => void;
  /** Visually de-emphasise while a new query replaces the current results. */
  dim?: boolean;
  listRef?: Ref<FlatList<MovieSummary>>;
  testID?: string;
  /** Wishlist only: swipe a card left to remove it (reveals a red trash background; full swipe removes). */
  swipeToRemove?: boolean;
}

/**
 * The poster grid shared by Discover and Wishlist. It owns the wishlist wiring so each card gets plain, stable props.
 * FlatList virtualises for us: only rows near the viewport are mounted, which is what keeps very long lists cheap.
 */
export function MovieList({ data, header, empty, footer, onEndReached, refreshing = false, onRefresh, dim = false, listRef, testID, swipeToRemove = false }: Props) {
  const { columns, cardWidth, gap, padding } = useColumns();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { ids } = useWishlist();
  const { mutate } = useToggleWishlist();

  const onOpen = useCallback((m: MovieSummary) => navigation.navigate('MovieDetail', { id: m.id, title: m.title }), [navigation]);
  const onToggle = useCallback((movie: MovieSummary, add: boolean) => mutate({ movie, add }), [mutate]);
  const onRemove = useCallback((movie: MovieSummary) => mutate({ movie, add: false }), [mutate]);

  const renderItem: ListRenderItem<MovieSummary> = useCallback(
    ({ item }) => {
      const card = <MovieCard movie={item} width={cardWidth} wished={ids.has(item.id)} onOpen={onOpen} onToggle={onToggle} />;
      if (!swipeToRemove) return card;
      return (
        <Swipeable
          renderRightActions={(_progress, drag) => (
            <Animated.View
              style={[styles.swipeAction, { width: cardWidth, transform: [{ translateX: drag.interpolate({ inputRange: [-cardWidth, 0], outputRange: [0, cardWidth], extrapolate: 'clamp' }) }] }]}
              accessible
              accessibilityLabel={`Remove ${item.title} from wishlist`}
            >
              <Ionicons name="trash" size={26} color="#fff" />
            </Animated.View>
          )}
          overshootRight={false}
          onSwipeableOpen={(direction) => direction === 'right' && onRemove(item)}
        >
          {card}
        </Swipeable>
      );
    },
    [cardWidth, ids, onOpen, onToggle, onRemove, swipeToRemove],
  );

  const pad = (node: ReactElement | null | undefined) => (node ? <View style={{ paddingHorizontal: padding }}>{node}</View> : null);

  return (
    <FlatList
      // numColumns cannot change on a mounted FlatList; a new key remounts it when rotation/tablet width changes the count.
      key={columns}
      ref={listRef}
      testID={testID}
      data={data}
      numColumns={columns}
      renderItem={renderItem}
      extraData={ids}
      keyExtractor={keyExtractor}
      columnWrapperStyle={{ gap, paddingHorizontal: padding }}
      ItemSeparatorComponent={() => <View style={{ height: gap }} />}
      ListHeaderComponent={pad(header)}
      ListEmptyComponent={pad(empty)}
      ListFooterComponent={pad(footer)}
      onEndReached={onEndReached}
      onEndReachedThreshold={1.5}
      refreshControl={onRefresh ? <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} /> : undefined}
      style={dim ? styles.dim : undefined}
      contentContainerStyle={styles.content}
      initialNumToRender={10}
      windowSize={7}
      maxToRenderPerBatch={8}
      removeClippedSubviews
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
    />
  );
}

const keyExtractor = (m: MovieSummary) => String(m.id);

const styles = StyleSheet.create({
  content: { paddingBottom: 24 },
  dim: { opacity: 0.5 },
  swipeAction: { backgroundColor: colors.danger, borderRadius: radius, alignItems: 'center', justifyContent: 'center', alignSelf: 'stretch' },
});
