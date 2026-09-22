import { expect, test, type Page } from '@playwright/test';

const MOCK = 'http://localhost:4100';
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

const cards = (page: Page) => page.locator('article.card:not(.skeleton)');
const upstream = async (page: Page) => (await (await page.request.get(`${MOCK}/__log`)).json()) as { path: string; query: Record<string, string> }[];

test.beforeEach(async ({ page }) => {
  await page.request.get(`${MOCK}/__reset`);
  // Poster/backdrop images normally come from TMDB's CDN; serve a pixel so tests need no internet.
  await page.route('https://image.tmdb.org/**', (r) => r.fulfill({ contentType: 'image/png', body: PNG }));
});

async function scrollUntilCards(page: Page, n: number) {
  await expect(async () => {
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    expect(await cards(page).count()).toBeGreaterThanOrEqual(n);
  }).toPass({ timeout: 15_000 });
}

test('browse -> filter -> infinite scroll -> open movie -> Back restores filters, list and scroll position', async ({ page }) => {
  await page.goto('/');
  await expect(cards(page)).toHaveCount(20);

  await page.getByRole('button', { name: 'Drama', exact: true }).click();
  await expect(page).toHaveURL(/genre=18/);
  await expect(cards(page).first()).toContainText('Drama 1');

  await scrollUntilCards(page, 40); // page 2 arrived via infinite scroll
  await page.evaluate(() => window.scrollTo(0, 1500));
  await page.waitForTimeout(300); // let scroll position settle
  const countBefore = await cards(page).count();
  const callsBefore = (await upstream(page)).length;

  // Click a card that is on screen via a dispatched event: Playwright's own click() auto-scrolls the target
  // into view, which would change the very scroll position this test is measuring.
  const idx = await page.evaluate(() =>
    [...document.querySelectorAll('article.card:not(.skeleton) a')].findIndex((a) => {
      const r = a.getBoundingClientRect();
      return r.top > 90 && r.top < window.innerHeight - 100;
    }),
  );
  expect(idx).toBeGreaterThanOrEqual(0);
  const target = page.locator('article.card:not(.skeleton) a').nth(idx);
  const title = (await target.locator('h3').textContent())!;
  const before = await page.evaluate(() => window.scrollY);
  expect(before).toBeGreaterThan(1000);
  await target.dispatchEvent('click');
  await expect(page).toHaveURL(/\/movie\/\d+/);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

  await page.goBack();

  // Filters restored from the URL, the same loaded pages, and the same scroll offset.
  await expect(page).toHaveURL(/genre=18/);
  await expect(page.getByRole('button', { name: 'Drama', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(cards(page)).toHaveCount(countBefore);
  await expect(page.locator('article.card h3', { hasText: title }).first()).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.scrollY), { timeout: 5000 }).toBeGreaterThan(before - 60);
  expect(await page.evaluate(() => window.scrollY)).toBeLessThan(before + 60);

  // No list refetch: returning is served from the client cache. (Only the detail call happened.)
  const newCalls = (await upstream(page)).slice(callsBefore);
  expect(newCalls.filter((c) => c.path.includes('discover'))).toHaveLength(0);
});

test('header Discover tab restores the scroll position, and changing a filter resets to the top', async ({ page }) => {
  await page.goto('/?genre=18');
  await scrollUntilCards(page, 40);
  await page.evaluate(() => window.scrollTo(0, 1200));
  await page.waitForTimeout(300);
  const y = await page.evaluate(() => window.scrollY);
  expect(y).toBeGreaterThan(1000);

  // A tab click is a NEW navigation, so the browser alone would start at the top. Only our keyed
  // ScrollRestoration brings the offset back.
  await page.getByRole('link', { name: /Wishlist/ }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Your wishlist' })).toBeVisible();
  await page.getByRole('link', { name: 'Discover', exact: true }).click();
  await expect(cards(page).first()).toContainText('Drama 1');
  await expect.poll(() => page.evaluate(() => window.scrollY), { timeout: 5000 }).toBeGreaterThan(y - 60);

  // Changing a filter from deep in the list must show the top of the NEW list, not a stale offset.
  // (dispatchEvent: Playwright's click() would scroll the chip into view and hide what we are testing.)
  await page.getByRole('button', { name: 'Comedy', exact: true }).dispatchEvent('click');
  await expect(cards(page).first()).toContainText('Comedy 1');
  await expect.poll(() => page.evaluate(() => window.scrollY), { timeout: 5000 }).toBeLessThan(50);
});

test('header Discover tab returns to the last filters after visiting the wishlist', async ({ page }) => {
  await page.goto('/?genre=35&sort=rating.desc');
  await expect(cards(page).first()).toContainText('Comedy 1');
  await page.getByRole('link', { name: /Wishlist/ }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Your wishlist' })).toBeVisible();
  await page.getByRole('link', { name: 'Discover', exact: true }).click();
  await expect(page).toHaveURL(/genre=35/);
  await expect(page).toHaveURL(/sort=rating.desc/);
  await expect(cards(page).first()).toContainText('Comedy 1');
});

test('rapid typing sends one search request for the final text, not one per keystroke', async ({ page }) => {
  await page.goto('/');
  await expect(cards(page)).toHaveCount(20);
  const term = `rapid${Date.now() % 10000}`;
  await page.getByLabel('Search movies').pressSequentially(term, { delay: 40 });
  await expect(page.getByRole('heading', { level: 1 })).toContainText(term);
  await expect(cards(page).first()).toContainText(`Match ${term}`);
  const searches = (await upstream(page)).filter((c) => c.path.includes('/search/'));
  expect(searches.map((s) => s.query.query)).toEqual([term]);
});

test('search mode: only Relevance sort, total hidden once genre filters refine pages, sort restored when cleared', async ({ page }) => {
  const term = `srch${Date.now() % 10000}`;
  await page.goto(`/?sort=rating.desc&q=${term}`);
  await expect(cards(page).first()).toContainText(`Match ${term}`);
  const sort = page.getByLabel('Sort by');
  await expect(sort).toBeDisabled();
  await expect(sort.locator('option')).toHaveText(['Relevance']);
  await expect(page.locator('.count')).toHaveText('40 movies'); // plain search: TMDB total is exact

  await page.getByRole('button', { name: 'Comedy', exact: true }).click(); // now filtered per page
  await expect(page.locator('.count')).toHaveCount(0);
  await expect(page.getByText(/total is not shown/)).toBeVisible();

  const searches = (await upstream(page)).filter((c) => c.path.includes('/search/'));
  expect(searches.every((c) => !('sort_by' in c.query))).toBe(true); // TMDB is never asked to sort a search

  await page.getByLabel('Search movies').fill('');
  await page.getByLabel('Search movies').press('Enter');
  await expect(sort).toBeEnabled();
  await expect(sort).toHaveValue('rating.desc'); // the sort in the URL survived the search
  await expect(page).toHaveURL(/sort=rating.desc/);
});

test('empty search shows the empty state and Clear resets it', async ({ page }) => {
  await page.goto('/?q=zzznothing');
  await expect(page.getByText('No movies found')).toBeVisible();
  await page.getByRole('button', { name: 'Clear search and filters' }).click();
  await expect(cards(page)).toHaveCount(20);
  await expect(page).not.toHaveURL(/q=/);
});

test('outage shows a retryable error, and Try again recovers', async ({ page }) => {
  await page.goto('/');
  await expect(cards(page)).toHaveCount(20);
  await page.request.get(`${MOCK}/__down`); // outage on
  await page.goto(`/?q=outage${Date.now() % 10000}`); // uncached query cannot be served stale
  await expect(page.getByRole('alert')).toContainText(/service|reach|wrong/i);
  await page.request.get(`${MOCK}/__down`); // outage off
  await page.getByRole('button', { name: 'Try again' }).click();
  await expect(cards(page).first()).toBeVisible();
});

test('slow network: skeleton, "still loading" hint, and infinite scroll with a pending-page skeleton', async ({ page }) => {
  await page.request.get(`${MOCK}/__delay?ms=3500`);
  await page.goto(`/?q=slow${Date.now() % 10000}`);
  await expect(page.locator('.skeleton').first()).toBeVisible();
  await expect(page.getByText('Still loading')).toBeVisible({ timeout: 8000 });
  await expect(cards(page)).toHaveCount(20, { timeout: 15_000 });

  await page.request.get(`${MOCK}/__delay?ms=2000`);
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await expect(page.locator('.skeleton').first()).toBeVisible(); // next page pending
  await expect(cards(page)).toHaveCount(40, { timeout: 15_000 });
});

test('changing a filter while a slow request is in flight cancels the stale one and shows only the latest', async ({ page }) => {
  await page.goto('/');
  await expect(cards(page)).toHaveCount(20);
  await page.request.get(`${MOCK}/__delay?ms=1500`);
  await page.getByRole('button', { name: 'Comedy', exact: true }).click();
  await page.getByRole('button', { name: 'Drama', exact: true }).click(); // supersedes Comedy
  await expect(cards(page).first()).toContainText('Drama 1', { timeout: 10_000 });
  await expect(page).toHaveURL(/genre=18/);
  await expect(page.locator('article.card h3', { hasText: 'Comedy' })).toHaveCount(0);
});

test('wishlist heart is optimistic under a slow network, persists across reload, and rolls back on failure', async ({ page }) => {
  let putFinished = false;
  await page.route('**/api/wishlist/*', async (route) => {
    if (route.request().method() === 'PUT') {
      await new Promise((r) => setTimeout(r, 1500)); // throttle the write
      putFinished = true;
    }
    await route.continue();
  });

  await page.goto('/');
  await expect(cards(page)).toHaveCount(20);
  const first = cards(page).first();
  const title = (await first.locator('h3').textContent())!;
  const heart = first.getByRole('button', { name: /wishlist/i });

  await heart.click();
  await expect(heart).toHaveAttribute('aria-pressed', 'true', { timeout: 500 }); // instant, before the server answered
  expect(putFinished).toBe(false);
  await expect.poll(() => putFinished).toBe(true);

  await page.reload(); // survives closing/reopening the page
  await page.getByRole('link', { name: /Wishlist/ }).click();
  await expect(page.locator('article.card h3', { hasText: title })).toBeVisible();
  await expect(page.locator('.badge')).toHaveText('1');

  // Failure path: the request fails -> heart reverts and the user is told.
  await page.unroute('**/api/wishlist/*');
  await page.route('**/api/wishlist/*', (route) => (route.request().method() === 'PUT' ? route.abort() : route.continue()));
  await page.getByRole('link', { name: 'Discover', exact: true }).click();
  const second = cards(page).nth(1);
  const h2 = second.getByRole('button', { name: /wishlist/i });
  await h2.click();
  await expect(page.getByRole('status').filter({ hasText: /Could not add/ })).toBeVisible();
  await expect(h2).toHaveAttribute('aria-pressed', 'false');
});

test('removing from the wishlist page updates instantly and shows the empty state', async ({ page }) => {
  await page.goto('/');
  await cards(page).first().getByRole('button', { name: /Add .* to wishlist/ }).click();
  await page.getByRole('link', { name: /Wishlist/ }).click();
  await expect(cards(page)).toHaveCount(1);
  await cards(page).first().getByRole('button', { name: /Remove .* from wishlist/ }).click();
  await expect(page.getByText('Your wishlist is empty')).toBeVisible();
});

test.describe('small screens', () => {
  test.use({ viewport: { width: 320, height: 700 } });

  test('no horizontal overflow at 320px with a very long title and missing posters', async ({ page }) => {
    await page.goto('/');
    await expect(cards(page)).toHaveCount(20);
    await expect(page.locator('.card-title', { hasText: 'Extraordinarily' })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await expect(page.locator('.poster-fallback').first()).toBeVisible(); // movies without posters get a placeholder
    const t = page.locator('.card-title', { hasText: 'Extraordinarily' });
    const box = await t.boundingBox();
    expect(box!.height).toBeLessThan(60); // clamped to two lines, not a wall of text
  });
});
