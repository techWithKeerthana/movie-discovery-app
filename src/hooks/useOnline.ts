import { useNetInfo } from '@react-native-community/netinfo';

/**
 * Both fields start `null` until the first native check resolves; treat that as online so the app never
 * flashes an offline banner on launch. Only a confirmed `false` counts as offline.
 */
export function useOnline(): boolean {
  const { isConnected, isInternetReachable } = useNetInfo();
  return isConnected !== false && isInternetReachable !== false;
}
