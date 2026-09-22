# CLAUDE.md — Operating Instructions for Claude Agent

Movie Discovery App (internship assignment). **React Native (Expo) app + Node.js backend**, TMDB as the external API.
`README.md` holds the assignment spec and the submission write-up; this file tells you how to change the code.
The project is graded on architecture, resilience, and the owner's ability to **explain every line**. Optimise for
clarity and defensibility over cleverness.

## 1. Architecture

npm-workspaces monorepo, all TypeScript:

```
shared/     API contract types only (MovieSummary, MovieDetail, Page, ApiErrorBody, SortOption + SORT_OPTIONS). No app logic.
backend/    Express 5 (ESM). routes/ -> services/ -> tmdb/ (client, cache, singleFlight, rateLimiter, mappers) ; db/ (libSQL)
App.tsx, index.ts, app.json, package.json, tsconfig.json, assets/, src/   the Expo SDK 57 / React Native 0.86 app IS the repo root
            src/{navigation,screens,components,hooks,api,lib,test}. Run every Expo command from the root.
tools/      mock-tmdb.mjs: a faithful fake TMDB for running/testing without a token
archive/    retired React web frontend + Playwright suite. Reference only: never edit, install, build or import from it.
```

Data flow: `App -> EXPO_PUBLIC_API_URL/api (Express) -> TmdbClient -> TMDB` and `App -> /api/wishlist -> libSQL`.

Invariants (do not break):
1. **The app talks only to our backend.** TMDB URLs, keys and raw field names never reach the app.
2. **All TMDB access goes through `TmdbClient`** ([backend/src/tmdb/client.ts](backend/src/tmdb/client.ts)).
3. **Backend layering is one-directional:** routes (validate, delegate, respond) -> services (business rules) -> client (I/O + resilience) -> mappers (shape). Mappers never do I/O.
4. **Only the wishlist is persisted.** Movie metadata is cache-only. No tables mirroring TMDB data.
5. **The backend is stable.** The move to React Native changed nothing in it. Change backend code only when the task requires it, and then update `shared/`, mappers, tests and the README together.
6. `shared/` contract changes first; update backend, app and tests in the same change.
7. **Navigation architecture is load-bearing** (section 8): tabs stay mounted and `MovieDetail` is pushed on the root stack above them. That is what preserves scroll position and filters.
8. **Exactly one copy of React** (19.2.3) in `node_modules` (section 2).

## 2. Stack, commands, Expo rules

Node >= 22.13 (developed on 24). Backend: Express 5, zod, lru-cache, `@libsql/client` (SQLite-compatible: a local `file:` URL for dev/tests, a Turso `libsql://` URL + auth token in production — see [db/db.ts](backend/src/db/db.ts)), tsx, Vitest, supertest. App: Expo 57, React 19.2.3, React Native 0.86, **React Navigation 7** (native-stack + bottom-tabs), TanStack Query 5, `expo-image`, `@react-native-async-storage/async-storage`, `expo-crypto`, `@expo/vector-icons`, plain `StyleSheet` (no UI kit). App tests: `jest-expo` + `@testing-library/react-native` 14 (+ `test-renderer`).

| Task | Command (repo root) |
|---|---|
| Backend with reload (port 4000) | `npm run dev:backend` |
| Expo dev server | `npm run dev:mobile` |
| Fake TMDB (port 4100) | `npm run mock:tmdb` |
| Backend tests (Vitest) | `npm test` |
| App tests (Jest) | `npm run test:mobile` |
| Both | `npm run test:all` |
| Typecheck both | `npm run typecheck` |
| Live TMDB check (needs real token) | `npm run verify:tmdb -- --api http://localhost:4000` |
| Bundle check (no device needed) | `npx expo export --platform android --output-dir dist-check` (then delete `dist-check`) |

**Expo changes every SDK: do not trust memory.** Before writing code that touches an Expo/React Native/React Navigation API, read the versioned docs (`https://docs.expo.dev/versions/v57.0.0/...`, index at `https://docs.expo.dev/llms.txt`). Known SDK 57 facts: `StyleSheet.absoluteFillObject` is gone (use `StyleSheet.absoluteFill`); `expo-crypto` has a synchronous `randomUUID()`; `expo-image` uses `contentFit` and `placeholder`; RNTL 14 is async (section 9).
- Add packages with `npx expo install <pkg>` (resolves SDK-compatible versions), run from the repo root. Never guess versions.
- Only libraries bundled in **Expo Go** work without a dev build. Do not add a package with custom native code without saying so and getting agreement.
- Never hand-edit or create `ios/` or `android/` (they are generated); configure via `app.json` and config plugins.
- **`EXPO_PUBLIC_*` variables are inlined at bundle time and readable by anyone with the app.** Read them only as `process.env.EXPO_PUBLIC_NAME` (static dot notation; destructuring/brackets are NOT inlined). Never put a secret in one.
- **One React.** npm hoists peers to the root; a second React copy causes "Invalid hook call" at runtime (Metro bundling will NOT warn). The root `package.json` pins `react` 19.2.3 (dependency + `overrides`). When adding packages or upgrading the SDK, run `npm ls react` and confirm a single version, matching what `expo` expects.

Backend config is env-driven via [backend/src/config.ts](backend/src/config.ts) (zod-validated); never read `process.env` elsewhere in the backend. New settings go in `config.ts` **and** `backend/.env.example`. The app's only setting is `EXPO_PUBLIC_API_URL` (root `.env`, template `.env.example`). The root `.env` is for `EXPO_PUBLIC_*` only; `TMDB_TOKEN` belongs solely in `backend/.env` (which the backend loads by file path, independent of the working directory).
- **Root package layout:** the root `package.json` is the app (`main: index.ts`) and also declares `workspaces: ["shared","backend"]`. Do not run Expo commands in `backend/`. Do not add a `main` or Expo config anywhere else. Jest is scoped to `src/` (`roots`) and `tsconfig.json` includes only app files, so backend code and Vitest tests never leak into app tooling; keep it that way.
- **Deployment:** the backend runs on Render's free tier (`trackzio-backend`, `srv-dap8gkjm8hqs73a4a740`) at `https://trackzio-backend.onrender.com`, `autoDeploy` on push to `main` on GitHub (`techWithKeerthana/movie-discovery-app`); its `DATABASE_URL`/`DATABASE_AUTH_TOKEN` point at a Turso database, since Render's own disk does not survive a redeploy or a sleep/wake cycle. The committed root `.env` points `EXPO_PUBLIC_API_URL` at that live URL, so the app needs no local backend by default. Render env vars are managed via its dashboard/API, never committed. A push to `main` redeploys the live backend — treat it accordingly (run the full verification in section 9 first).

## 3. Coding standards

- `strict` TypeScript; no `any` (use `unknown` + zod/narrowing); no `@ts-ignore`. `noUncheckedIndexedAccess` is on.
- Backend imports use the `.js` extension (NodeNext). The app uses extensionless imports.
- Match surrounding style: small focused modules, named exports, comments only for *why*. No narrating comments.
- Prefer extending existing helpers (`AppError`, `cleanQuery`, `api()`, `MovieList`, `States.tsx`, `OptionPicker`) over parallel ones.
- No new dependency without a stated reason; prefer platform/Expo built-ins. No dead code, unused endpoints or speculative abstractions.
- Keep pure logic pure and unit-testable (mappers, `computeLayout`, sort/filter).

## 4. Backend rules

- **Routes:** validate every input with zod (coerce numbers; `cleanQuery` drops empty params); bound everything (`page <= 500`, string lengths, body <= 10kb). Register specific routes before parametric ones. Async handlers just `throw` (Express 5).
- **Composition:** dependencies are injected via `createApp({config, tmdb, db})`; no singletons in services.
- **TMDB client pipeline (preserve order):** fresh cache -> single-flight -> circuit breaker -> rate limiter -> fetch (5s timeout, 1 retry on timeout/network/5xx/429, honour `Retry-After`) -> zod/mapper validation -> cache; on infrastructure failure fall back to the expired entry and flag `stale`. NOT_FOUND, bad credentials and invalid data are not retried and do not trip the breaker.
- **Never** cache an unvalidated response. Cache keys normalise param order.
- **Mappers:** lenient input schemas (`nullish`); drop unusable items rather than failing the page; emit explicit `null` / `''` / `[]`, never `undefined`. `UPSTREAM_INVALID` only for a wrong top-level shape.
- **Discover vs search:** discover filters/sorts upstream and is exact. TMDB `/search` cannot sort or filter by genre/rating: in search mode `sort` is **ignored** (relevance order; the app shows a disabled "Relevance"), and genre/min-rating apply per returned page in `MovieService.refineSearchPage`, so the app hides the total while they are on. Do not reintroduce per-page sorting or show an inexact total.
- **Sorting guard rails:** rating sorts need a vote-count floor; newest-first needs `primary_release_date.lte=today`.
- Log unexpected errors with `console.error` only; never log tokens, device ids in bulk, or request bodies.

## 5. Database and API rules

- libSQL via `@libsql/client` (async — every DB call is `await`ed; `Db` is a type alias for `@libsql/client`'s `Client`, do not import `node:sqlite` types). `DATABASE_URL` selects the backend: `file:...` locally, `libsql://<db>.turso.io` + `DATABASE_AUTH_TOKEN` in production (Render's own disk does not survive a redeploy or sleep/wake, so production must use Turso, not a local file). Schema changes are **append-only entries** in `MIGRATIONS`; never edit a shipped migration. Each migration's statements and its `PRAGMA user_version` bump run in one `db.batch(..., 'write')` call, so a crash mid-migration can't leave the version bumped without the schema applied.
- Prepared statements with bound parameters only; never interpolate into SQL.
- Wishlist: PK `(device_id, movie_id)`; snapshot JSON **re-validated on read** (corrupt row skipped, never fatal); `PUT` idempotent (`ON CONFLICT DO NOTHING`, keeps `added_at`); per-device cap `MAX_WISHLIST_PER_DEVICE`.
- API: JSON only; base path `/api`; errors always `{ error: { code, message, retryable } }` using `ErrorCode` from `shared`; stale answers set `X-Cache: stale`; status codes come from `AppError`.
- Adding an endpoint: type in `shared/`, zod-validate input, logic in a service, tests, README API table.

## 6. Authentication and security

There are **no user accounts**. Wishlist ownership is an anonymous UUID generated on first launch (`expo-crypto`), kept in AsyncStorage and sent as `X-Device-Id` (validated by `requireDeviceId`). It is an identifier, **not authentication**: never use it to protect sensitive data or call it auth. Real auth is a separate, explicit decision.

Non-negotiable:
- `TMDB_TOKEN` / `TMDB_API_KEY` live only in `backend/.env` (git-ignored). Never commit, log, echo, or ship them in the app or any `EXPO_PUBLIC_*` variable.
- Treat all client input (query, params, headers, body, including the wishlist snapshot) as untrusted; validate and constrain (snapshot image URLs must be `https://image.tmdb.org/`).
- Keep the outbound TMDB limiter and the inbound `express-rate-limit`. Keep CORS restricted to `CORS_ORIGIN` (irrelevant to native, relevant to any web target); never `*` outside tests.
- Render TMDB text only inside `<Text>`. Open external links with `Linking.openURL` on URLs we build (YouTube: `encodeURIComponent` the key) and handle rejection. Production API must be HTTPS.
- Do not expose stack traces or upstream error bodies; map to `AppError` codes.

## 7. Validation and error handling

- Validate at boundaries (HTTP in, TMDB in, DB JSON). Inside a boundary, trust the types.
- Backend: throw `AppError(code, message)`; only `errorHandler` turns errors into responses. `retryable` derives from the code.
- App `api()` converts every failure into `ApiError` (`NETWORK` for fetch failures; `AbortError` is rethrown so superseded requests stay silent). Offer **Try again only when `retryable`**.
- **Every screen that fetches must implement loading, empty and error states** (skeleton with real card dimensions plus the slow hint; empty with a next action; error with retry), and also: stale banner, next-page failure (inline Retry, never auto-loop), and partial failure when cached data exists.
- Mutations are optimistic with rollback and a visible message on failure (see `useToggleWishlist`).

## 8. React Native / React Navigation rules

- **Navigation:** `RootStack` (native-stack) contains `Tabs` (bottom-tabs: Discover, Wishlist) and `MovieDetail`, pushed above the tabs. Params are typed in `src/navigation/types.ts` (global `RootParamList`). Opening a movie from any list uses `navigate('MovieDetail', ...)`; from inside a detail screen use `push` so movies stack. Going to Discover from a detail screen uses `navigate('Tabs', { screen: 'Discover', params })`.
- **Never discard screen state accidentally:** do not set `unmountOnBlur`, `popToTopOnBlur`, `freezeOnBlur` tricks, `key` changes, or inline component definitions for screens; do not replace the stack root when opening a detail. Bottom tabs keep visited screens mounted; that is how scroll offset, search text, filters and loaded pages survive. If you change navigation, re-run the navigation tests and the manual walkthrough in the README.
- **State:** Discover filters live in the screen's `useState`; server data lives in TanStack Query (query key = filters). No global store. Server data is never mirrored into `useState`.
- **Requests:** pass TanStack's `signal` to `fetch`; debounce free text 300 ms (`SearchBar`); the keyboard Search key commits immediately; keep `placeholderData: keepPreviousData` on list queries. While a text search is active the request sort is always `popularity.desc`.
- **Lists:** `FlatList` only (never map a long list inside a `ScrollView`). Keep `keyExtractor` stable, cards `memo`'d with stable callbacks, `extraData` for wishlist ids, and `key={columns}` on the grid (numColumns cannot change on a mounted list). Put header/empty/footer as **elements**, not freshly defined components (a re-created header component remounts and steals TextInput focus). Auto-load only while pages yield results; respect the 500-page cap.
- **Layout:** columns and card width come from `computeLayout` (no per-device constants). Posters use the 2:3 `PosterImage` (fixed aspect ratio, `contentFit="cover"`, title fallback on missing/broken image). Titles `numberOfLines={2}` with two lines reserved; full title (no clamp) on the detail screen. Touch targets >= 44 (`TOUCH`). Respect safe areas (`SafeAreaView edges={['top']}` on tab screens; the native header handles the detail screen). Colours and radii come from `src/theme.ts`.
- **Interactive elements:** never nest touchables (the heart is a sibling of the card `Pressable`). Set `accessibilityRole`, `accessibilityLabel` and `accessibilityState` (`selected` for toggles, `disabled`). Skeleton animations respect reduce-motion.
- No `<select>` on native: use `OptionPicker`. Use `Linking`, `Modal`, `RefreshControl`, `Animated` from `react-native`; avoid web-only APIs (`window`, `localStorage`, DOM).
- Components stay presentational; data logic in `hooks/`; network only in `api/`.

## 9. Testing and verification

Definition of done: **run these and report real output**; never claim success from reading code.

1. `npm run typecheck` passes.
2. `npm test` (backend) passes: no network or token needed.
3. `npm run test:mobile` passes.
4. If dependencies, navigation, Metro config or imports of `shared` changed: the Android bundle check succeeds (first run is slow on Windows; run it in the background and poll the log for `Exported:`), and `npm ls react` shows one version.
5. Anything only a device can show (native scroll feel, gestures, keyboard, real TMDB data, look and feel) is **listed for the user, not claimed**. The README has the manual walkthrough.

Test conventions (Jest + RNTL 14):
- **RNTL 14 is async:** `await render(...)`, `await userEvent.setup().press(...)`, `await fireEvent(...)`, `await act(...)`, `await renderHook(...)`. Prefer `screen`, `getByRole` (`name`), then `getByLabelText`/`getByText`; `findBy*` for async; `queryBy*` only for absence; RNTL matchers (`toBeOnTheScreen`, `toBeSelected`, `toBeDisabled`, `toHaveDisplayValue`).
- Use the shared helpers in `src/test/helpers.tsx`: `mockApi(override)` is a fake backend (genres, paged lists, wishlist store keyed by device id; override returns a `Response` or `undefined` to fall through) and `renderApp()` mounts the real navigators exactly as `App.tsx` does. Native modules are faked once in `src/test/setup.tsx`.
- **FlatList virtualises in tests too** (about 10 rows render initially): assert list contents through the list's `data` prop (`getByTestId('discover-list').props.data`), not by counting rendered rows.
- `jest.mock` factories may only reference variables prefixed `mock`. Use `globalThis`, not `global`.
- The only console filter is the "not wrapped in act(" warning (async timers we cannot wrap); every other `console.error` must be investigated, not silenced.
- **A test must be able to fail.** For behaviour that could pass by accident, mutation-check it: break the feature temporarily, confirm the test fails, restore the code (verify the restore).
- Deterministic tests: inject or fake time where needed; real-timer waits only for the 300 ms debounce.
- Backend: every bug fix gets a regression test at the right layer (mapper with malformed fixtures, `TmdbClient` cache/single-flight/retry/breaker/stale, service param mapping, supertest routes). DB tests use a temp `file:` URL and **close handles** in `afterAll` via `rmSyncRetry` ([test/helpers.ts](backend/test/helpers.ts)) — on Windows a libSQL connection's OS handle can outlive `.close()` by a noticeable margin, so cleanup retries with backoff and logs (never throws) if it still loses the race; that's housekeeping, not a test assertion. Prefer a fresh file per test/connection over reusing one path across many `Client`s in the same file, except where the test is specifically about reopening the same database.
- Keep `tools/mock-tmdb.mjs` faithful to real TMDB (`422` above page 500, `404` for unknown ids, dirty/`null` list items). If `verify:tmdb` reveals a difference, update the mock and mapper tests first.

## 10. Git and branch conventions

- The repo is initialised on `master` with **no commits yet**. Do not create the first commit, add remotes, or push unless asked.
- When asked to commit: short-lived branch `feat/<slug>`, `fix/<slug>` or `chore/<slug>`; never force-push or rewrite shared history; never skip hooks.
- Conventional Commits (`feat(app): ...`, `fix(backend): ...`, `test:`, `docs:`, `chore:`). One logical change per commit; the message explains *why*.
- Never stage `.env`, `.env.local`, `backend/data/`, `node_modules/`, `dist*/`, `.expo/`. Check `git status` first. Keep `package-lock.json` in sync with `package.json` changes in the same commit. Append the attribution lines the harness specifies.

## 11. Constraints

- Assignment scope: React Native + Node, TMDB, persistent wishlist, context preserved across navigation. Do not expand scope (auth, payments, SSR, push notifications, offline sync, EAS builds, web target) without being asked.
- Windows dev environment; use PowerShell for native commands. In the Bash tool **do not use heredocs containing apostrophes** (they break); use Write/Edit for such files. Never use a bare `wait` when servers were started in the same shell. Long commands (Metro export, jest cold start) exceed short timeouts: run them in the background and poll.
- **Never kill processes you did not start.** The user may be running their own dev servers (backend, Expo); check with the user before stopping them or replacing files they lock. Stop only the servers you started.
- Temporary files go in the session scratchpad, not the repo. Delete `dist-check` after bundle checks.
- npm may report blocked install scripts (e.g. `esbuild`); this is expected and harmless here.

## 12. Things to avoid

- Calling TMDB from the app or from anywhere outside `TmdbClient`; exposing TMDB keys or raw shapes; putting secrets in `EXPO_PUBLIC_*`.
- Caching before validation; retrying non-transient errors; removing single-flight, the limiter, timeouts or the breaker "to simplify".
- Trusting client input; interpolating SQL; editing shipped migrations; adding tables for movie metadata.
- Web-only code in the app (`src/`, `App.tsx`: DOM, `window`, CSS, `localStorage`); importing from `archive/`.
- Changing navigation structure in a way that unmounts Discover; screens defined inline; a `ScrollView` wrapping a long list; `key` changes on screens.
- Adding a second copy of React, or a native-code dependency that Expo Go cannot load, without saying so.
- Per-keystroke requests; unbounded auto-fetch loops; silent `catch {}` that hides user-relevant failures (sanctioned exceptions: storage-unavailable fallbacks, `AccessibilityInfo` failures).
- Adding a dependency, abstraction, flag or endpoint that nothing uses.
- Reporting results you did not run ("works on device", "tests pass"); hiding limitations. Report failures and gaps verbatim.
- Editing `README.md` assignment-spec sections (1-9) other than the stack checkbox, or leaving README implementation sections stale after behaviour changes.
- Committing, pushing, deleting user data, or destructive commands without explicit instruction.

## 13. Development workflow (follow for every new task)

1. **Understand:** read the request and the relevant README section; find existing code that covers the need (`Grep`/`Read`). Reuse before writing.
2. **Check the docs** for any Expo / React Native / React Navigation API you are not certain about in SDK 57.
3. **Clarify only if blocked:** ask when the answer changes the design (data model, contract, scope); otherwise pick the conventional option and state it.
4. **Plan briefly (multi-file or design-affecting work):** affected layers, `shared/` changes, loading/empty/error cases, navigation impact, how it will be tested. Explain significant decisions with trade-offs; the owner must be able to defend them.
5. **Contract first:** `shared/`, then backend (schema/mapper -> service -> route) if needed, then app (api -> hook -> component -> screen).
6. **Implement incrementally** in steps that each typecheck; follow sections 3-8; keep changes minimal.
7. **Test** alongside the code (section 9), then **verify**: typecheck, both suites, bundle check when relevant.
8. **Update docs:** if behaviour, env vars, commands, decisions or limitations changed, update the matching README sections, `.env.example` files and this file.
9. **Report:** what changed and why; what was verified (actual results); what was **not** verified (device behaviour, real TMDB); new limitations or follow-ups. Do not commit unless asked.
