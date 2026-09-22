import { useEffect, useRef, type ReactNode } from 'react';
import { AccessibilityInfo, Animated, type StyleProp, type ViewStyle } from 'react-native';

/**
 * Fades its children in over ~300ms instead of a hard swap. Two usage patterns:
 *  - no `ready` prop: the wrapper only ever mounts once its content is ready (e.g. a screen that
 *    early-returns a skeleton, then returns this on the real content), so it fades in on mount.
 *  - `ready`: the wrapper is already mounted (e.g. wrapping a list whose empty-state IS the skeleton);
 *    it stays fully visible until `ready` flips true, then fades the now-real content in once.
 * Respects the OS "reduce motion" setting, same as the skeleton pulse in States.tsx.
 */
export function FadeIn({ ready = true, style, children }: { ready?: boolean; style?: StyleProp<ViewStyle>; children: ReactNode }) {
  const opacity = useRef(new Animated.Value(ready ? 0 : 1)).current;
  const hasFaded = useRef(false);

  useEffect(() => {
    if (!ready || hasFaded.current) return;
    hasFaded.current = true;
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled?.()
      .then((reduce) => {
        if (!alive) return;
        if (reduce) opacity.setValue(1);
        else Animated.timing(opacity, { toValue: 1, duration: 300, useNativeDriver: true }).start();
      })
      .catch(() => {
        if (alive) opacity.setValue(1);
      });
    return () => {
      alive = false;
    };
  }, [ready, opacity]);

  return <Animated.View style={[style, { opacity }]}>{children}</Animated.View>;
}
