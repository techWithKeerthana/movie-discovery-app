import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, radius } from '../theme';
import { useCompare } from './CompareContext';

const TAB_BAR_ALLOWANCE = 64; // keep the banner above the bottom tab bar, same as the toast

/** Persistent while one movie is picked and waiting for a second, from anywhere in the app. */
export function CompareBanner() {
  const { selected, clear } = useCompare();
  const insets = useSafeAreaInsets();
  if (!selected) return null;
  return (
    <View pointerEvents="box-none" style={[styles.region, { bottom: insets.bottom + TAB_BAR_ALLOWANCE }]}>
      <View style={styles.banner} accessibilityRole="alert" testID="compare-banner">
        <Text style={styles.text} numberOfLines={1}>
          Comparing: {selected.title} — tap another movie to compare
        </Text>
        <Pressable onPress={clear} accessibilityRole="button" accessibilityLabel="Cancel comparison" hitSlop={8} style={styles.clear}>
          <Text style={styles.clearText}>✕</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  region: { position: 'absolute', left: 0, right: 0, alignItems: 'center', paddingHorizontal: 16 },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.surface2,
    borderColor: colors.accent,
    borderWidth: 1,
    borderRadius: radius,
    paddingVertical: 10,
    paddingHorizontal: 14,
    maxWidth: 480,
  },
  text: { color: colors.text, fontSize: 13, flexShrink: 1 },
  clear: { padding: 2 },
  clearText: { color: colors.muted, fontWeight: '700' },
});
