import { useNavigation } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FadeIn } from '../components/FadeIn';
import { MovieList } from '../components/MovieList';
import { Button, EmptyState, ErrorState, SkeletonGrid } from '../components/States';
import { useWishlist } from '../hooks/useWishlist';
import type { RootStackParamList, TabParamList } from '../navigation/types';
import { colors, TOUCH } from '../theme';

export function WishlistScreen() {
  const { query, items } = useWishlist();
  const navigation = useNavigation<BottomTabNavigationProp<TabParamList>>();
  const rootNavigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  let empty: React.ReactElement | null = null;
  if (query.isPending) empty = <SkeletonGrid count={6} />;
  else if (query.isError && !query.data) empty = <ErrorState error={query.error} onRetry={() => query.refetch()} />;
  else if (items.length === 0)
    empty = (
      <EmptyState title="Your wishlist is empty" action={<Button primary label="Discover movies" onPress={() => navigation.navigate('Discover')} />}>
        Tap the heart on any movie to save it here. Your list is kept even after you close the app.
      </EmptyState>
    );

  const header = (
    <View style={styles.headRow}>
      <View>
        <Text style={styles.h1} accessibilityRole="header">
          Your wishlist
        </Text>
        {items.length > 0 && <Text style={styles.count}>{items.length} saved</Text>}
      </View>
      <Pressable
        onPress={() => rootNavigation.navigate('TasteProfile')}
        accessibilityRole="button"
        accessibilityLabel="Your Taste"
        style={({ pressed }) => [styles.tasteBtn, pressed && { opacity: 0.85 }]}
      >
        <Text style={styles.tasteBtnText}>Your Taste</Text>
      </Pressable>
    </View>
  );

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <FadeIn ready={!query.isPending} style={styles.fade}>
        <MovieList
          testID="wishlist-list"
          data={items}
          header={header}
          empty={empty}
          refreshing={query.isRefetching}
          onRefresh={() => query.refetch()}
          swipeToRemove
        />
      </FadeIn>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  fade: { flex: 1 },
  headRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 12, paddingBottom: 12 },
  h1: { color: colors.text, fontSize: 22, fontWeight: '700' },
  count: { color: colors.muted, fontSize: 13 },
  tasteBtn: { minHeight: TOUCH - 8, paddingHorizontal: 14, borderRadius: 999, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface2, alignItems: 'center', justifyContent: 'center' },
  tasteBtnText: { color: colors.text, fontWeight: '600', fontSize: 13 },
});
