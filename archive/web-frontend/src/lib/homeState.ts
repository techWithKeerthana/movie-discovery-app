/** sessionStorage key holding the Discover page's last query string (filters/search/sort). */
export const HOME_SEARCH_KEY = 'trackzio.homeSearch';

export function getHomeSearch(): string {
  try {
    return sessionStorage.getItem(HOME_SEARCH_KEY) ?? '';
  } catch {
    return '';
  }
}
