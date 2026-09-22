import { useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useOnline } from '../hooks/useOnline';
import { colors } from '../theme';

/** Persistent while offline; slides up and away (not a hard disappear) once connectivity returns. */
export function OfflineBanner() {
  const online = useOnline();
  const insets = useSafeAreaInsets();
  const [mounted, setMounted] = useState(!online);
  const translateY = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!online) {
      translateY.setValue(0);
      setMounted(true);
      return;
    }
    if (!mounted) return; // already hidden
    Animated.timing(translateY, { toValue: -120, duration: 250, useNativeDriver: true }).start(({ finished }) => {
      if (finished) setMounted(false);
    });
  }, [online, mounted, translateY]);

  if (!mounted) return null;
  return (
    <Animated.View
      style={[styles.banner, { paddingTop: insets.top + 8, transform: [{ translateY }] }]}
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      testID="offline-banner"
    >
      <Text style={styles.text}>You're offline — showing cached results</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  banner: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 50, paddingBottom: 8, paddingHorizontal: 16, backgroundColor: colors.warnBg, borderBottomWidth: 1, borderBottomColor: colors.warnBorder },
  text: { color: colors.text, fontSize: 13, fontWeight: '600', textAlign: 'center' },
});
