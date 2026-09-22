import '@testing-library/react-native/matchers';
import 'react-native-gesture-handler/jestSetup';

// Native modules and browser-ish APIs are replaced with light JS doubles so the screens run under Node.

jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));

jest.mock('@react-native-community/netinfo', () => require('@react-native-community/netinfo/jest/netinfo-mock'));

// GestureHandlerRootView is a harmless View wrapper, kept real. Swipeable's real implementation drives native
// Animated/gesture machinery that never settles under Jest (it hung the whole test run). This keeps the same
// `onSwipeableOpen` callback a completed swipe would fire, via a plain pressable, so the WIRING (does a full
// swipe call the right handler?) stays a real, failable test without fighting native gesture internals — the
// gesture feel itself is device-only, like the rest of native touch/scroll behaviour (see CLAUDE.md section 9).
jest.mock('react-native-gesture-handler', () => {
  const RN = require('react-native');
  return {
    GestureHandlerRootView: ({ children }: { children: React.ReactNode }) => children,
    Swipeable: ({ children, onSwipeableOpen }: { children: React.ReactNode; onSwipeableOpen?: (d: 'left' | 'right') => void }) => (
      <RN.View>
        {children}
        <RN.Pressable accessibilityRole="button" accessibilityLabel="simulate full swipe" onPress={() => onSwipeableOpen?.('right')} />
      </RN.View>
    ),
  };
});

jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);

let mockUuidCounter = 0;
jest.mock('expo-crypto', () => ({
  // Deterministic, valid v4-shaped ids.
  randomUUID: () => `00000000-0000-4000-8000-${String(++mockUuidCounter).padStart(12, '0')}`,
}));

// expo-image renders a native view; RN's Image is enough to assert on props in tests.
jest.mock('expo-image', () => ({ Image: require('react-native').Image }));

jest.mock('@expo/vector-icons', () => {
  const { Text } = require('react-native');
  return new Proxy({}, { get: () => (props: { name: string }) => <Text>{props.name}</Text> });
});

// Timers we cannot wrap in act() (FlatList render batches, the search debounce, TanStack Query notifications) update
// state outside act in these async tests. The warning is noise there and would bury real ones, so only these two
// known message classes are filtered; every other console.error still surfaces. The second appears specifically in
// the offline tests, where `settle()` intentionally forces a rerender from inside a `waitFor` poll (there is no
// other way to make a component re-read a jest-mocked global like NetInfo outside React's own data flow).
const realError = console.error;
console.error = (...args: unknown[]) => {
  if (typeof args[0] === 'string' && args[0].includes('was not wrapped in act(')) return;
  if (typeof args[0] === 'string' && args[0].includes('not configured to support act(')) return;
  realError(...args);
};
