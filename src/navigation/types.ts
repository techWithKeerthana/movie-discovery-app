import type { NavigatorScreenParams } from '@react-navigation/native';
import type { MovieDetail } from '@trackzio/shared';

export type TabParamList = {
  /** `genre` + `nonce` let the detail screen jump to Discover filtered by a genre (nonce makes repeat jumps re-apply). */
  Discover: { genre?: number; nonce?: number } | undefined;
  Wishlist: undefined;
};

export type RootStackParamList = {
  Tabs: NavigatorScreenParams<TabParamList> | undefined;
  MovieDetail: { id: number; title?: string };
  TasteProfile: undefined;
  /** The two movies picked via the Compare button on their detail screens. */
  Compare: { a: MovieDetail; b: MovieDetail };
};

declare global {
  namespace ReactNavigation {
    // Makes useNavigation()/navigate() type-safe everywhere without passing generics.
    interface RootParamList extends RootStackParamList {}
  }
}
