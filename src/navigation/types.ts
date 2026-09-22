import type { NavigatorScreenParams } from '@react-navigation/native';

export type TabParamList = {
  /** `genre` + `nonce` let the detail screen jump to Discover filtered by a genre (nonce makes repeat jumps re-apply). */
  Discover: { genre?: number; nonce?: number } | undefined;
  Wishlist: undefined;
};

export type RootStackParamList = {
  Tabs: NavigatorScreenParams<TabParamList> | undefined;
  MovieDetail: { id: number; title?: string };
};

declare global {
  namespace ReactNavigation {
    // Makes useNavigation()/navigate() type-safe everywhere without passing generics.
    interface RootParamList extends RootStackParamList {}
  }
}
