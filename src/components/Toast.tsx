import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, radius } from '../theme';

const Ctx = createContext<(msg: string) => void>(() => {});
export const useToast = () => useContext(Ctx);

const TAB_BAR_ALLOWANCE = 64; // keep the toast above the bottom tab bar

export function ToastProvider({ children }: { children: ReactNode }) {
  const [msg, setMsg] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const opacity = useRef(new Animated.Value(0)).current;
  const insets = useSafeAreaInsets();

  const show = useCallback(
    (m: string) => {
      setMsg(m);
      opacity.setValue(1);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        Animated.timing(opacity, { toValue: 0, duration: 200, useNativeDriver: true }).start(() => setMsg(null));
      }, 4000);
    },
    [opacity],
  );

  useEffect(() => () => clearTimeout(timer.current), []);

  return (
    <Ctx.Provider value={show}>
      {children}
      {msg !== null && (
        <View pointerEvents="none" style={[styles.region, { bottom: insets.bottom + TAB_BAR_ALLOWANCE }]}>
          <Animated.View style={[styles.toast, { opacity }]} accessibilityLiveRegion="polite" accessibilityRole="alert">
            <Text style={styles.text}>{msg}</Text>
          </Animated.View>
        </View>
      )}
    </Ctx.Provider>
  );
}

const styles = StyleSheet.create({
  region: { position: 'absolute', left: 0, right: 0, alignItems: 'center', paddingHorizontal: 16 },
  toast: {
    backgroundColor: colors.dangerBg,
    borderColor: colors.dangerBorder,
    borderWidth: 1,
    borderRadius: radius,
    paddingVertical: 10,
    paddingHorizontal: 14,
    maxWidth: 480,
  },
  text: { color: colors.text, fontSize: 14 },
});
