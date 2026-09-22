import { QueryClientProvider } from '@tanstack/react-query';
import { NavigationContainer } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { navTheme, RootNavigator } from './src/navigation/RootNavigator';
import { OfflineBanner } from './src/components/OfflineBanner';
import { ToastProvider } from './src/components/Toast';
import { useOnline } from './src/hooks/useOnline';
import { useSyncOfflineWishlist } from './src/hooks/useWishlist';
import { queryClient } from './src/queryClient';

/** No UI: flushes any wishlist changes queued while offline the moment connectivity returns. */
function OfflineSync() {
  useSyncOfflineWishlist(useOnline());
  return null;
}

export default function App() {
  return (
    // Required by react-native-gesture-handler (Swipeable, used for swipe-to-remove on the wishlist).
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <ToastProvider>
            <NavigationContainer theme={navTheme}>
              <RootNavigator />
            </NavigationContainer>
            <OfflineBanner />
            <OfflineSync />
          </ToastProvider>
          <StatusBar style="light" />
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
