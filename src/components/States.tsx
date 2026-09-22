import { useEffect, useRef, useState, type ReactNode } from 'react';
import { AccessibilityInfo, Animated, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { ApiError } from '../api/client';
import { computeLayout, GAP } from '../hooks/useColumns';
import { colors, radius, TOUCH } from '../theme';

/** Pulsing opacity for skeletons. Respects the OS "reduce motion" setting. */
function usePulse() {
  const v = useRef(new Animated.Value(0.5)).current;
  const [reduce, setReduce] = useState(false);

  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled?.()
      .then((r) => alive && setReduce(r))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (reduce) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(v, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(v, { toValue: 0.5, duration: 700, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [reduce, v]);

  return v;
}

/** Placeholder cards with the SAME 2:3 poster box as real cards, so content loading in causes no layout jump. */
export function SkeletonGrid({ count = 8 }: { count?: number }) {
  const { width } = useWindowDimensions();
  const { columns, cardWidth } = computeLayout(width);
  const opacity = usePulse();
  return (
    <Animated.View style={[styles.skelGrid, { opacity }]} testID="skeleton" accessibilityLabel="Loading" accessibilityRole="progressbar">
      {Array.from({ length: Math.max(columns, count) }, (_, i) => (
        <View key={i} style={[styles.skelCard, { width: cardWidth }]}>
          <View style={styles.skelPoster} />
          <View style={styles.skelLine} />
          <View style={[styles.skelLine, { width: '55%' }]} />
        </View>
      ))}
    </Animated.View>
  );
}

export function SkeletonBlock({ height, width = '100%' }: { height: number; width?: number | `${number}%` }) {
  const opacity = usePulse();
  return <Animated.View testID="skeleton" style={{ height, width, borderRadius: 8, backgroundColor: colors.surface2, opacity }} />;
}

export function Button({ label, onPress, primary = false }: { label: string; onPress: () => void; primary?: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [styles.btn, primary && styles.btnPrimary, pressed && { opacity: 0.8 }]}
    >
      <Text style={[styles.btnText, primary && { color: colors.accentInk }]}>{label}</Text>
    </Pressable>
  );
}

export function EmptyState({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <View style={styles.state} accessibilityRole="summary">
      <Text style={styles.icon}>🎞️</Text>
      <Text style={styles.stateTitle} accessibilityRole="header">
        {title}
      </Text>
      {children ? <Text style={styles.stateBody}>{children}</Text> : null}
      {action}
    </View>
  );
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const known = error instanceof ApiError ? error : null;
  const retryable = known ? known.retryable : true;
  const message = known?.code === 'NOT_FOUND' ? 'We could not find that.' : (known?.message ?? 'Something went wrong while loading this.');
  return (
    <View style={styles.state} accessibilityRole="alert">
      <Text style={styles.icon}>⚠️</Text>
      <Text style={styles.stateTitle}>Something went wrong</Text>
      <Text style={styles.stateBody}>{message}</Text>
      {/* TEMP DEBUG: remove before submission (also ApiError.debug in api/client.ts). */}
      {known ? (
        <Text selectable style={styles.debug}>
          {`[debug] code=${known.code} status=${known.debug?.status ?? 'no response'}\n${known.debug?.url ?? ''}${known.debug?.raw ? `\n${known.debug.raw}` : ''}`}
        </Text>
      ) : null}
      {retryable && onRetry ? <Button primary label="Try again" onPress={onRetry} /> : null}
    </View>
  );
}

export function InlineError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <View style={styles.inlineError} accessibilityRole="alert">
      <Text style={styles.inlineText}>{message}</Text>
      <Button label="Retry" onPress={onRetry} />
    </View>
  );
}

export function StaleBanner() {
  return (
    <View style={styles.banner} accessibilityRole="alert">
      <Text style={styles.bannerText}>
        The movie service is having trouble right now, so you are seeing saved results. They may be a little out of date.
      </Text>
    </View>
  );
}

/** True once `active` has stayed true for `ms`: reassurance on slow connections. 8s (not 3s) so a normal
 * first load / cold Metro bundle never shows it — this should mean something is actually wrong. */
export function useSlowHint(active: boolean, ms = 8000) {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    if (!active) {
      setSlow(false);
      return;
    }
    const t = setTimeout(() => setSlow(true), ms);
    return () => clearTimeout(t);
  }, [active, ms]);
  return slow;
}

export function SlowHint({ show }: { show: boolean }) {
  if (!show) return null;
  return (
    <Text style={styles.slow} accessibilityLiveRegion="polite">
      Still loading… this is taking longer than usual.
    </Text>
  );
}

const styles = StyleSheet.create({
  skelGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: GAP },
  skelCard: { backgroundColor: colors.surface, borderRadius: radius, overflow: 'hidden', paddingBottom: 12 },
  skelPoster: { aspectRatio: 2 / 3, backgroundColor: colors.surface2 },
  skelLine: { height: 12, borderRadius: 6, backgroundColor: colors.surface2, marginTop: 10, marginHorizontal: 10 },
  state: { alignItems: 'center', paddingVertical: 48, paddingHorizontal: 24, gap: 10 },
  icon: { fontSize: 40 },
  stateTitle: { color: colors.text, fontSize: 18, fontWeight: '700', textAlign: 'center' },
  stateBody: { color: colors.muted, fontSize: 14, textAlign: 'center', maxWidth: 320 },
  debug: { color: colors.muted, fontSize: 11, textAlign: 'center', maxWidth: 320, fontFamily: 'monospace' }, // TEMP DEBUG
  btn: {
    minHeight: TOUCH,
    paddingHorizontal: 18,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface2,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  btnPrimary: { backgroundColor: colors.accent, borderColor: colors.accent },
  btnText: { color: colors.text, fontWeight: '600' },
  inlineError: {
    backgroundColor: colors.dangerBg,
    borderColor: colors.dangerBorder,
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    marginVertical: 12,
    alignItems: 'center',
    gap: 8,
  },
  inlineText: { color: colors.text },
  banner: { backgroundColor: colors.warnBg, borderColor: colors.warnBorder, borderWidth: 1, borderRadius: 10, padding: 12, marginBottom: 12 },
  bannerText: { color: colors.text, fontSize: 13 },
  slow: { color: colors.muted, fontSize: 13, marginBottom: 8 },
});
