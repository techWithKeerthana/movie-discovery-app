import { Ionicons } from '@expo/vector-icons';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { DarkTheme, type Theme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useWishlist } from '../hooks/useWishlist';
import { DiscoverScreen } from '../screens/DiscoverScreen';
import { MovieDetailScreen } from '../screens/MovieDetailScreen';
import { WishlistScreen } from '../screens/WishlistScreen';
import { colors } from '../theme';
import type { RootStackParamList, TabParamList } from './types';

export const navTheme: Theme = {
  ...DarkTheme,
  colors: { ...DarkTheme.colors, background: colors.bg, card: colors.bg, text: colors.text, border: colors.border, primary: colors.accent },
};

const Tab = createBottomTabNavigator<TabParamList>();
const Stack = createNativeStackNavigator<RootStackParamList>();

/**
 * Discover and Wishlist are tabs. Bottom tabs keep every visited tab MOUNTED, so switching tabs never resets a
 * screen's scroll offset, loaded pages, search text or filters.
 */
function Tabs() {
  const { items } = useWishlist();
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.muted,
        tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.border },
      }}
    >
      <Tab.Screen
        name="Discover"
        component={DiscoverScreen}
        options={{ tabBarIcon: ({ color, size }) => <Ionicons name="compass-outline" color={color} size={size} /> }}
      />
      <Tab.Screen
        name="Wishlist"
        component={WishlistScreen}
        options={{
          tabBarIcon: ({ color, size }) => <Ionicons name="heart-outline" color={color} size={size} />,
          tabBarBadge: items.length > 0 ? items.length : undefined,
          tabBarBadgeStyle: { backgroundColor: colors.accent, color: colors.accentInk },
        }}
      />
    </Tab.Navigator>
  );
}

/**
 * The stack holds the tabs as its root and pushes MovieDetail ON TOP of them. The tab navigator (and the list you were
 * scrolling) stays mounted underneath, so Back returns to exactly the same scroll position, filters and loaded pages.
 */
export function RootNavigator() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: colors.bg },
        headerTintColor: colors.text,
        headerShadowVisible: false,
        contentStyle: { backgroundColor: colors.bg },
      }}
    >
      <Stack.Screen name="Tabs" component={Tabs} options={{ headerShown: false }} />
      <Stack.Screen
        name="MovieDetail"
        component={MovieDetailScreen}
        options={({ route }) => ({ title: route.params.title ?? 'Movie', headerBackTitle: 'Back' })}
      />
    </Stack.Navigator>
  );
}
