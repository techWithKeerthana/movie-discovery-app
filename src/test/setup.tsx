import '@testing-library/react-native/matchers';

// Native modules and browser-ish APIs are replaced with light JS doubles so the screens run under Node.

jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));

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
// state outside act in these async tests. The warning is noise there and would bury real ones, so only this one message
// class is filtered; every other console.error still surfaces.
const realError = console.error;
console.error = (...args: unknown[]) => {
  if (typeof args[0] === 'string' && args[0].includes('was not wrapped in act(')) return;
  realError(...args);
};
