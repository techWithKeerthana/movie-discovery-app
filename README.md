# Movie Discovery App — Full-Stack Intern Assignment

This README captures the full assignment requirements as a working spec. Use it to plan, build, and track progress. The bottom sections (Setup, Approach, Decisions, Assumptions, Limitations, AI Usage, Future Improvements) are placeholders to fill in **after** the app is built, since the assignment requires them in the final submission.

## 1. Problem Statement

Build a movie discovery application that lets users explore a large collection of movies and find titles they're interested in, using a public third-party movie API as the data source.

The app should feel like a real product, not an API demo. Evaluation looks at product thinking, architecture, technical decisions, and handling of real-world scenarios — not just the final UI.

## 2. Technology Stack

Choose **one**:
- [ ] React + Node.js (web) *(initial implementation; archived in `archive/`)*
- [x] React Native + Node.js (mobile)

Database and supporting libraries are your choice — pick and justify them.

## 3. User Experience Requirements

On opening the app, users should be able to browse and discover movies without needing to search for something specific.

Users should be able to:
- [ ] Search for movies
- [ ] Explore movies using relevant categories or attributes
- [ ] Change how results are ordered (sorting)
- [ ] Continue exploring when there are many matching results (pagination / infinite scroll)
- [ ] Open a movie to view more details
- [ ] Add movies to a **persistent** wishlist and access it later — including after closing and reopening the app
- [ ] Navigate between browsing, movie details, and the wishlist without losing context (e.g., scroll position, filters, search state)

The app must give appropriate feedback for:
- [ ] Loading states
- [ ] No results
- [ ] Errors / something going wrong

The app should remain usable as content volume grows (large result sets).

## 4. External Movie Data & Backend Requirements

- [ ] The client talks **only** to your Node.js backend — never directly to the external movie API
- [ ] The backend acts as an abstraction layer: decide how external data is transformed/represented before exposing it to the client

The backend/app must gracefully handle:
- [ ] Repeated requests for the same information (caching)
- [ ] Rapid successive searches or filter changes (debouncing/cancellation of stale requests)
- [ ] The external service being slow or temporarily unavailable
- [ ] The external service returning incomplete or unexpected data
- [ ] Rate limits on the external API

## 5. Responsive / Device Considerations

The app should adapt naturally to different screen sizes and devices. Explicitly consider:
- [ ] Different screen widths
- [ ] Movie posters with varying dimensions/aspect ratios
- [ ] Long movie titles (text overflow/truncation)
- [ ] Large result sets (rendering performance)
- [ ] Slow network conditions
- [ ] Empty result states
- [ ] Failed requests
- [ ] Users rapidly changing search/filters

## 6. Technical Decisions to Make (and document)

- [ ] Frontend structure/architecture
- [ ] Node.js API design (routes, layering)
- [ ] Data flow between external service → backend → database → client
- [ ] How wishlist data is persisted
- [ ] What data your app stores vs. fetches live from the external service
- [ ] Strategy for efficiently handling large numbers of results
- [ ] Strategy for avoiding unnecessary/duplicate requests
- [ ] Failure handling and inconsistent external data
- [ ] Maintainability approach as the app grows

There's no single correct answer — the reasoning behind each decision matters as much as the decision itself.

## 7. Use of AI

AI-assisted tools (Claude, ChatGPT, Copilot, Cursor, Gemini, etc.) are explicitly allowed and encouraged for research, boilerplate, debugging, code review, and exploring approaches.

However:
- [ ] You must understand and be able to explain every part of the code you submit
- [ ] Be ready to: explain architecture/decisions, trace data flow, identify limitations, debug live, modify a feature, or implement a new requirement on request
- [ ] Using AI heavily does **not** automatically lower evaluation — submitting an unexplainable AI-generated solution does

## 8. Deliverables Checklist

- [x] Working application
- [x] Frontend source code
- [x] Node.js backend source code
- [x] Database/schema (where applicable)
- [ ] Git repository
- [x] README containing:
  - [x] Setup instructions
  - [x] Approach taken
  - [x] Important technical decisions
  - [x] Assumptions made
  - [x] Known limitations
  - [x] AI tools used and how (if applicable)
  - [x] What you'd improve with more time

## 9. Evaluation Criteria

- Product thinking and UX
- Frontend implementation
- Backend architecture
- Third-party API integration
- Data modelling and persistence
- Handling of large result sets
- Performance and efficiency
- Error and edge-case handling
- Responsive design
- Code quality and maintainability
- Technical decision-making
- Ability to explain, debug, and extend the implementation

A follow-up discussion or live coding session may follow submission, possibly with an added scenario or requirement.

---

## Setup Instructions

**Prerequisites:** Node.js 22.13+ (built and tested on Node 24), a free TMDB account, and a way to run the app: **Expo Go** on a phone (iOS/Android; it must support Expo SDK 57, so keep it updated), or an Android emulator / iOS simulator. The wishlist database needs no setup for local dev (a local file, created automatically); a cloud deployment needs a free [Turso](https://turso.tech) database — see **Database** below.

The backend and the Expo app run side by side, in two terminals:

```bash
# 0. Install everything once, from the repo root (the Expo app IS the root package; backend and shared are workspaces)
npm install

# 1. Backend (terminal 1)
cp backend/.env.example backend/.env      # then set TMDB_TOKEN in backend/.env
#    (TMDB -> Settings -> API -> "API Read Access Token")
npm run dev:backend                        # API on http://localhost:4000

# 2. Point the app at the backend (terminal 2)
cp .env.example .env                       # then set EXPO_PUBLIC_API_URL (see table)
npx expo start                             # or: npm run dev:mobile. Both run from the repo root. Expo dev server; scan the QR code with Expo Go,
                                           # or press "a" (Android emulator) / "i" (iOS simulator)
```

`EXPO_PUBLIC_API_URL` depends on where the app runs relative to the backend:

| App runs on | `EXPO_PUBLIC_API_URL` |
|---|---|
| iOS simulator | `http://localhost:4000` |
| Android emulator | `http://10.0.2.2:4000` (the emulator's alias for your computer) |
| Physical phone (Expo Go) | `http://<your computer's LAN IP>:4000` (phone and computer on the same Wi-Fi) |
| Production | `https://your-api.example.com` (HTTPS is required for release builds) |

Notes and troubleshooting:
- **Every screen says "Movie service is temporarily unavailable":** the app reached the backend, but the backend cannot reach TMDB (VPN off, ISP block, or bad token). On start the backend prints `TMDB token present: true/false`; `curl https://api.themoviedb.org/3/configuration` from the backend machine should answer `401` (reachable) rather than hang. `npm run verify:tmdb` gives the full picture. (TEMP DEBUG: error screens currently show the status code and URL; search for `TEMP DEBUG` to remove before submission.)
- **Where to run Expo:** always from the repo root; `App.tsx`, `index.ts` and the app's `package.json` (with `"main": "index.ts"`) live there. Do not run Expo commands inside `backend/`. (Two `.env` files exist on purpose: the root `.env` holds only `EXPO_PUBLIC_*` values for the app; `backend/.env` holds `TMDB_TOKEN`. Expo never reads the backend one.)
- **Phone cannot reach the API:** open `http://<LAN IP>:4000/api/health` in the phone's browser. If it fails, allow Node.js through the Windows firewall for private networks. The backend listens on all interfaces; CORS is irrelevant to a native app.
- **After changing the root `.env`,** restart Expo with `npx expo start -c`, then fully reload the app (shake the device, then Reload). The value is baked into the JavaScript bundle at build time as `process.env.EXPO_PUBLIC_API_URL`, so it must never hold a secret (the TMDB token stays in `backend/.env`).
- **No TMDB token yet?** Use the bundled mock: `npm run mock:tmdb` (port 4100), then start the backend against it:
  PowerShell: `$env:TMDB_TOKEN='fake'; $env:TMDB_BASE_URL='http://localhost:4100/3'; npm run dev:backend` ·
  bash: `TMDB_TOKEN=fake TMDB_BASE_URL=http://localhost:4100/3 npm run dev:backend`.
- Dev builds on Android 9+ block plain-HTTP traffic (Expo Go allows it). For a development/production build use an HTTPS API URL, or allow cleartext for development only.

| Command | What it does |
|---|---|
| `npm run dev:backend` | Node API with reload on http://localhost:4000 |
| `npm run dev:mobile` | Expo dev server for the app |
| `npm run mock:tmdb` | Fake TMDB on port 4100 for running with no token |
| `npm test` | Backend tests (Vitest; TMDB faked, no network or token needed) |
| `npm run test:mobile` | App tests (Jest + React Native Testing Library; `fetch` faked) |
| `npm run test:all` | Both |
| `npm run typecheck` | TypeScript check for backend and the app |
| `npm run verify:tmdb` | One-time live check against the **real** TMDB (needs your token): endpoint health, latency, headers, how often fields are null, whether our mappers accept real payloads. Add `-- --api http://localhost:4000` to also check our own API |

**Environment variables.** Backend (`backend/.env`): `TMDB_TOKEN` (required; or `TMDB_API_KEY` for a v3 key), `PORT` (4000), `CORS_ORIGIN`, `DATABASE_URL` (`file:./data/trackzio.db`) + `DATABASE_AUTH_TOKEN` (only for a remote Turso URL), `TMDB_TIMEOUT_MS` (5000), `TMDB_RATE_PER_SEC` (40). App (root `.env`): `EXPO_PUBLIC_API_URL`.

**Database:** [libSQL](https://turso.tech/libsql) (SQLite-compatible), via `@libsql/client`. Locally this is just a file, created and migrated automatically on first start (`backend/data/`, git-ignored) — no setup step, no account. For a cloud deployment whose own disk does **not** survive a redeploy or a sleep/wake cycle (e.g. Render's free tier), point `DATABASE_URL`/`DATABASE_AUTH_TOKEN` at a free Turso database instead — same schema, same queries, only the connection URL changes ([backend/src/db/db.ts](backend/src/db/db.ts)). Schema, as versioned migrations:

```sql
CREATE TABLE wishlist (
  device_id TEXT NOT NULL, movie_id INTEGER NOT NULL,
  snapshot  TEXT NOT NULL,          -- JSON of the display fields
  added_at  INTEGER NOT NULL,
  PRIMARY KEY (device_id, movie_id)
);
```

## Approach Taken

The repo root is the Expo (React Native) app, so `npx expo start` works from it; `shared/` and `backend/` are npm workspaces beneath it:

```
App.tsx, index.ts, app.json, package.json   Expo app entry and config (the root package)
src/        the app: navigation, screens, components, hooks, api, lib, test (React Navigation, TanStack Query)
assets/     app icons and splash
shared/     TypeScript types for the API contract (MovieSummary, MovieDetail, Page, errors)
backend/    Node + Express + TypeScript: routes -> services -> TMDB client (cache, dedupe, limiter, retry) -> mappers
tools/      mock-tmdb.mjs, a fake TMDB for running and testing without a token
archive/    the earlier React web frontend and its Playwright suite, kept for reference only (not built or installed)
```

**Data flow:** `App -> EXPO_PUBLIC_API_URL/api (Express) -> TmdbClient -> TMDB`, and `App -> /api/wishlist -> libSQL (Turso in the cloud)`.
The app never sees TMDB URLs, field names or keys. The backend converts TMDB into a small normalised model
(`MovieSummary` / `MovieDetail`) where every optional value is an explicit `null`, `''` or `[]`.

**API surface** (all under `/api`; unchanged by the move to mobile):

| Route | Purpose | TMDB source |
|---|---|---|
| `GET /movies?query&genre&year&minRating&sort&page` | Browse / search / filter / sort, paginated (`sort` applies to browse; text searches are always in relevance order and ignore it) | `/discover/movie` (no text) or `/search/movie` (text) |
| `GET /movies/trending?page` | Trending this week | `/trending/movie/week` |
| `GET /movies/:id` | Details + cast, trailer, similar in **one** upstream call | `/movie/{id}?append_to_response=credits,videos,similar` |
| `GET /genres` | Genre list for the filter chips | `/genre/movie/list` |
| `GET /wishlist`, `PUT /wishlist/:id`, `DELETE /wishlist/:id` | Persistent wishlist (libSQL), identified by `X-Device-Id` | none |
| `GET /health` | Status + cache/limiter counters | none |

**Navigation architecture (React Navigation):**

```
RootStack (native-stack)
├── Tabs (bottom-tabs)        Discover | Wishlist            (wishlist count shown as the tab badge)
└── MovieDetail               pushed ON TOP of the tabs, from either tab or from "More like this"
```

**Screens:** *Discover* (search bar, genre chips, sort / year / min-rating pickers, infinite grid, pull-to-refresh), *Movie details* (poster, facts, genres that jump back to Discover, overview, trailer, cast, similar titles, wishlist button), *Wishlist* (saved snapshots, works even if TMDB is down). Loading, empty and error states exist on every screen.

## Important Technical Decisions

**Backend as an abstraction layer.** Routes are thin (validate input, call a service, send JSON). Services hold
business rules (how our sort names map to TMDB's, search-vs-discover). One class, `TmdbClient`, is the only code that
talks to TMDB, so every resilience rule is in one place and testable with a fake `fetch`.

**Resilience pipeline in `TmdbClient`** (`fresh cache -> single-flight -> circuit breaker -> rate limiter -> fetch(timeout, retry) -> validate -> cache`):
- *Caching:* in-memory LRU with per-endpoint TTLs (genres 24h, details 1h, lists 5-10 min). Keys normalise parameter order.
- *Stale-while-error:* expired entries are kept 24h. If TMDB fails, the expired entry is served with an `X-Cache: stale` header and the app shows a banner. Users see slightly old data instead of an error.
- *De-duplication:* concurrent identical requests share one in-flight promise (25 identical requests -> 1 upstream call; tested).
- *Slow/down TMDB:* 5 s timeout, one retry with jitter on timeout/network/5xx/429 (honouring `Retry-After`), then a circuit breaker (5 consecutive failures -> fail fast for 30 s, serving stale data if any). Errors reach the app as `{error:{code,message,retryable}}`; the app shows "Try again" only when `retryable`.
- *Rate limits:* outbound requests are spaced to <= 40/s (TMDB's soft limit is ~50/s), queueing rather than failing. Inbound `/api` is also rate-limited to protect our server.
- *Incomplete/unexpected data:* lenient zod schemas; an item without a usable id/title is dropped, not fatal; missing poster/date/rating become `null`; a `0.0` rating with `0` votes becomes "unrated" (`null`); a wrong top-level shape becomes `502 UPSTREAM_INVALID` and is never cached.

**What is stored vs. fetched live.** Only the wishlist is persisted. All movie metadata is cache-only: it changes upstream, would need sync logic and invalidation, and adds nothing the cache does not already give. The wishlist row stores a small JSON *snapshot* of the display fields, so the wishlist renders instantly and even when TMDB is down; the details screen still loads live data.

**Wishlist persistence: libSQL on the backend, anonymous device id.** On first launch the app generates a UUID (`expo-crypto`), stores it in AsyncStorage and sends it as `X-Device-Id`; the wishlist is keyed by `(device_id, movie_id)`. Chosen over on-device-only storage because the assignment asks for a backend/database story, and over accounts because auth is out of scope. `PUT` is idempotent (safe on retries/double-taps). The heart updates optimistically and rolls back with a message if the request fails. libSQL (SQLite-compatible) via `@libsql/client`: a local file for dev with zero infrastructure and zero native builds, or a free Turso database when the deployment target's own disk doesn't survive a restart — same schema and queries either way, only the connection URL changes.

**Rapid searches: debounce + cancellation.** The search box commits after a 300 ms pause (the keyboard's Search key commits immediately). The committed filters are the TanStack Query key, so a new search starts a new query and the previous request is aborted through the `AbortSignal` that Query passes to `fetch`: at most one search is in flight for the list. The old results stay visible (dimmed) via `keepPreviousData` instead of flashing to a spinner.

**Large result sets.** Server-side pagination straight through to TMDB (`discover` does all filtering/sorting upstream, so pages are exact). The grid is a `FlatList`, which virtualises: only rows near the viewport are mounted, however many pages are loaded (memoised cards, stable callbacks, images loaded by `expo-image` with disk caching). Infinite scroll uses `onEndReached`. TMDB caps deep paging at 500 pages, and the app says so at the end instead of silently stopping. Auto-loading pauses if a page yields nothing (possible in filtered search) and offers a button instead, so we never chain hundreds of empty requests; a failing page shows an inline Retry rather than looping.

**Keeping context when navigating.** Tabs keep every visited screen mounted, and `MovieDetail` is pushed on the root stack *above* the tab navigator, so the list you were scrolling is never unmounted. Back therefore returns to the same scroll offset, loaded pages, search text and filters with no refetch and no persistence code (the web version needed URL state plus a scroll-restoration library for this). Filters live in the Discover screen's state; TanStack Query keeps loaded pages for 60 minutes. Re-tapping the active Discover tab scrolls to the top, and changing a filter starts the new list at the top.

**Sensible sort behaviour.** "Highest rated" adds a vote-count floor (otherwise 1-vote 10.0 films dominate); "Newest" excludes unreleased titles. While searching, the sort control shows a disabled "Relevance": TMDB cannot sort search results, and sorting each page locally would look like a real ordering but be wrong across pages, so it is not offered (the backend ignores `sort` for text searches; the chosen sort returns when the search is cleared). Likewise the result total is hidden when genre/rating filters make it inaccurate.

**Responsive/robust UI.** The grid's column count follows the window width (2 on phones, up to 6 on tablets/landscape) and card width fills the row exactly (a pure, unit-tested function), so any device width works without breakpoints. Posters sit in a fixed 2:3 box with `contentFit="cover"`, so any source aspect ratio gives uniform cards, and a missing or broken poster falls back to a title tile. Titles are clamped to two lines (two lines are always reserved so cards stay equal height) and wrap fully on the details screen. Skeletons match the real card dimensions and pulse (respecting the OS reduce-motion setting), a "still loading" hint appears after 3 s, and touch targets are at least 44 pt. There is no `<select>` in React Native, so sort/year/rating use a small bottom-sheet picker.

**Tooling choices.** React Navigation was chosen as specified (Expo's template defaults to Expo Router, which is built on React Navigation; the difference is file-based routing, not capability). Data fetching is TanStack Query (the same hooks as the earlier web version). Images use `expo-image`, the device id uses AsyncStorage + `expo-crypto`, all included in Expo Go. Versions come from `npx expo install`, so they match the Expo SDK.

**One copy of React.** npm hoists peer dependencies (React Navigation asks for `react >= 19`) to the repo root, which silently produced a second React (19.3) next to the app's pinned 19.2.3 and would crash the app with "Invalid hook call". The root `package.json` therefore declares `react` 19.2.3 explicitly (plus an `overrides` entry) so every package shares the single copy. Keep it equal to the version `expo` expects when upgrading the SDK.

**Maintainability.** Shared TypeScript contract between backend and app; dependency injection in `createApp` (tests use a fake `fetch` and a temp libSQL file); one error type (`AppError`) mapped in one middleware; append-only DB migrations; typed navigation params.

**Testing strategy.**
- *Backend (Vitest, 59 tests, no network or token):* mappers fed malformed TMDB data; the TMDB client's cache, TTL expiry, LRU eviction, single-flight (including shared failures), retry policy, circuit breaker (open / probe / reset), stale-while-error, rate limiter and credential handling; the service's TMDB parameter mapping and search-mode refinement; the libSQL wishlist (persistence across connections, migrations, corrupt rows, per-device isolation, cap, SQL-injection-shaped input); and the HTTP contract via supertest.
- *App (Jest + React Native Testing Library, 72 tests):* the real navigators and screens with a fake backend that stores wishlists per device id. It covers loading / empty / error / retry / stale states on every screen; debounce; cancellation of a superseded search (asserting the first request's `AbortSignal` fires); search-mode sort and total behaviour; filters; infinite scroll (append, de-duplicate, next-page failure, 500-page end, empty-page guard); navigation context (Back returns to the same mounted Discover screen with search text, filters and loaded pages intact and no refetch; tab switching; detail from the wishlist; "More like this"; genre jump); the optimistic heart with rollback; wishlist persistence across a simulated app restart (same device id from storage, list read back from the server, and a fresh device sees an empty list); API client behaviour (env-driven base URL, headers, error mapping, non-JSON errors, aborts); the responsive grid maths. The navigation-state tests were mutation-checked (making Discover forget its state on blur makes them fail).
- These run in Node with faked native modules, so they prove logic and wiring, **not** native rendering or touch behaviour; see Known Limitations. `npm run verify:tmdb` complements them with a one-command check against the *real* TMDB.

## Assumptions Made

- **TMDB** is the movie source; "categories" = TMDB genres, and "attributes" = release year and minimum rating.
- The wishlist is **per app install** (anonymous device id), not per logged-in user.
- English-language metadata, adult titles excluded.
- Single backend instance (the cache is in process memory).
- Image URLs use TMDB's public image CDN directly; only *metadata* goes through the backend.
- The trailer opens in the YouTube app or browser via the OS rather than being embedded.
- Portrait, dark-theme app; Expo Go (or a dev build) as the way to run it. Store submission and native builds (EAS) are out of scope.

## Known Limitations

Each item states the decision (**Accepted** = documented and left as is; **Planned** = worth doing next) and a rough
effort estimate for one developer, including tests.

| Limitation | Impact | Decision | Effort to fix |
|---|---|---|---|
| **The app has not yet been run on a real device or simulator** (automated checks are Jest with faked native modules and a successful Metro production bundle for Android) | Layout, gestures, keyboard behaviour, native scroll feel and platform quirks are unverified until someone runs it. This is the largest open risk | **Planned first**: run the walkthrough in the section below on a phone / emulator and record findings | **~30 min** to run; fixes depend on findings |
| **Live TMDB not yet verified in this repository's test runs** | Everything is tested against fakes/a mock that mirrors documented TMDB behaviour; a real-world quirk could still appear | **Planned first**: run `npm run verify:tmdb -- --api http://localhost:4000` with a real token and record the findings | **~15 min** to run; fixes depend on findings |
| **Search mode: sort is not available, and genre/rating filters apply per page** (TMDB `/search` cannot sort or filter) | While a text search is active the sort control shows a disabled **Relevance** (TMDB's order) and the backend ignores `sort`, so we never present a per-page ordering as if it were global. The chosen sort returns when the search is cleared. Genre and min-rating still refine each returned page, so such a page can have fewer than 20 items; because the backend total counts unfiltered matches, the **total is hidden while those filters are on** (a plain search, or a year filter, which TMDB does apply, still shows its exact total). Auto-loading continues whenever a page yields results | **Fixed** (sort + total). **Remaining part accepted**: genre/rating are per page | To make genre/rating exact: aggregate several TMDB pages per request with a composite cursor, **~1-1.5 days**, costs more TMDB calls and latency; a fully exact solution needs our own search index (multi-day) |
| **Cache is in process memory** | Lost on restart; not shared across instances. A cold start is just a handful of TMDB requests. The one real cost: if TMDB is down *at the moment the server restarts* there is no stale copy to fall back on, so users see the error state (with Try again) instead of saved results | **Accepted.** Reasoning: single-instance app; the cache is an optimisation, not a source of truth; nothing is lost that cannot be re-fetched; the failure window (restart *during* an outage) is narrow and degrades to a clear error, not to wrong data. Adding infrastructure would cost more than the risk it removes | SQLite-backed second-level cache **~3-4 h**; Redis (also shares the rate limiter across instances) **~0.5 day** plus infrastructure |
| **Wishlist is tied to a per-install device id** | Uninstalling the app, clearing its data, or using another phone starts an empty wishlist. The id is a random UUID (unguessable, so it works as a capability token), but it is **not authentication**: anyone who obtains it can read and edit that wishlist. No sync between devices | **Accepted.** Reasoning: the assignment requires persistence across closing and reopening the app (met: server-side libSQL keyed by a stored id) and does not require accounts; accounts would add signup/login, sessions, password or OAuth handling and a security surface that dwarfs the rest of the feature. An optional "recovery code" (show/copy/import the id) was considered and **skipped**: it is not a quick change once UI, validation and tests are counted, and it turns the id into something users copy around, which only makes sense alongside accounts | Recovery code **~2-3 h**; real accounts with sessions and migrating device rows to a user **~1.5-3 days** including a security review |
| **Filters and scroll are kept only while the app process lives** | If the OS kills the app in the background, Discover restarts with default filters at the top (the wishlist is unaffected, it is on the server) | **Accepted**: normal mobile behaviour; the requirement is preserving context while *navigating* | Persist filters in AsyncStorage **~2 h**; restoring scroll offset across a cold start is fiddly (**~0.5 day**) |
| **Plain HTTP only works in development** | Expo Go allows `http://` to a LAN address; release builds (and Android dev builds) need an HTTPS API | **Accepted** for dev; production must use HTTPS | Deploy behind TLS; hosting is outside this assignment |
| **Title sort uses TMDB's `original_title`** | Non-English films sort by their original-language title | **Accepted** (TMDB's discover has no localised-title sort) | Not fixable upstream; would need our own index |
| **No cloud deployment exists yet; a Render + Turso deploy is unverified** | The backend still needs an actual Render web service and an actual Turso database created and wired together (`DATABASE_URL`/`DATABASE_AUTH_TOKEN`, `TMDB_TOKEN`/`TMDB_API_KEY`) before the app can point at a live URL instead of a LAN address. The code path is covered by the same 59 backend tests (against a local libSQL file), but a real Turso connection and Render's cold-start/sleep behaviour are untested | **Planned next**, once Render API access and a Turso database exist | Provisioning **~15-20 min** once credentials are available; see Setup for the exact steps |
| **Whole wishlist is loaded at once** (cap 1000 per device) | Fine at the cap (~1 KB per item), but not paginated | **Accepted** | **~2-3 h** |
| **TMDB stops paging at 500 pages** (about 10,000 titles per view) | The app explains it at the end of the list | **Accepted** (upstream limit) | Narrow filters; nothing to fix |
| **No on-device end-to-end tests and no CI** | Tests run locally in Jest; nothing exercises real native rendering or gestures automatically | **Planned** | Maestro or Detox flows **~1-2 days**; GitHub Actions for typecheck + Jest **~1 h** |
| **Portrait, dark theme only; basic accessibility** | Labels/roles/states are set and touch targets are 44 pt, but there is no light theme, no landscape lock testing and no screen-reader audit | **Accepted** | ~1-2 days |
| The `/api/movies/trending` endpoint is implemented and tested but **not used by the app** | Dead-ish surface area | **Accepted** (the backend is intentionally unchanged); remove it or add a "Trending" row later | ~1 h either way |

## Manual walkthrough on a device (what automated tests cannot prove)

1. Discover loads a grid with skeletons first. Tap a genre chip; the list reloads from the top.
2. Scroll down until a second page loads (skeleton row at the bottom). Open a movie, then press Back: the list must be at the same position with the same chip selected and no reload flash.
3. Switch to the Wishlist tab and back to Discover: same position and filters. Re-tap the Discover tab: it scrolls to the top.
4. Type quickly in the search box: one request after you pause; the sort control shows a disabled "Relevance"; clear it with the x and your previous sort returns.
5. With a genre chip selected, search: the total disappears and the note explains why.
6. Tap a heart: it fills instantly. Force-close and reopen the app: the movie is still in the Wishlist tab.
7. Turn on airplane mode or stop the backend: you get an error state with Try again, and recovering the connection then tapping Try again loads the list.
8. Rotate / use a tablet or split-screen: the column count changes; titles stay clamped to two lines; posters stay 2:3.
9. Use the device's slowest network profile: skeletons and the "Still loading" hint appear, and tapping hearts stays responsive.

## AI Tools Used

Used Claude (Claude Code) as a pair-programming assistant to discuss the architecture, read TMDB's API behaviour and
edge cases, generate initial boilerplate and tests, and review the result. The decisions (stack, layering, caching and
resilience strategy, what is persisted, the wishlist identity model, navigation architecture) were discussed and chosen
explicitly, and I went through the code so that I can explain and modify it.
*(Edit this paragraph to reflect your own actual usage before submitting.)*

## What I'd Improve With More Time

- Run and tune on real devices (the top item in Known Limitations); add Maestro/Detox flows and a CI workflow running typecheck, Jest and `verify:tmdb` on a schedule (to catch TMDB API drift).
- Accounts (or at least a shareable wishlist code) so the wishlist follows the user across devices; migrate device rows to a user on sign-in.
- Redis (or similar) for the cache and the rate limiter so multiple backend instances share them; background refresh of hot entries (true stale-while-revalidate).
- Persist Discover filters across cold starts; a light theme and a screen-reader audit.
- Cursor-style "load until N results" for filtered search, or an own search index for exact filtering across search results.
- Observability: structured logs, request ids, metrics from `/health` into a dashboard; alerts on breaker-open.
- Wishlist extras: undo on remove, sorting, "watched" state; responsive image sizes for tighter bandwidth on slow networks.
