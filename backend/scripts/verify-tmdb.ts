/**
 * Live sanity check against the REAL TMDB API (needs backend/.env with TMDB_TOKEN or TMDB_API_KEY).
 *
 *   npm run verify:tmdb -w backend                 # TMDB only
 *   npm run verify:tmdb -w backend -- --api http://localhost:4000   # also check our running API (the app's EXPO_PUBLIC_API_URL)
 *
 * It reports (1) whether every endpoint we use answers and how fast, (2) which rate-limit / cache headers exist,
 * (3) how often optional fields are null/missing in real data, (4) whether our mappers accept the real payloads
 * and how many items they drop. Exit code 1 if anything hard-fails. Read-only; makes ~15 requests.
 */
import { loadConfig } from '../src/config.js';
import { parseGenres, parseMovieDetail, parseMoviePage } from '../src/tmdb/mappers.js';

const cfg = loadConfig();
const apiIdx = process.argv.indexOf('--api');
const OUR_API = apiIdx > -1 ? process.argv[apiIdx + 1] : undefined;

if (!cfg.TMDB_TOKEN && !cfg.TMDB_API_KEY) {
  console.error('No TMDB credentials. Put TMDB_TOKEN (or TMDB_API_KEY) in backend/.env first.');
  process.exit(2);
}

let failures = 0;
const warn: string[] = [];
const ok = (m: string) => console.log(`  ok    ${m}`);
const bad = (m: string) => {
  failures++;
  console.log(`  FAIL  ${m}`);
};
const note = (m: string) => {
  warn.push(m);
  console.log(`  note  ${m}`);
};

async function tmdb(path: string, params: Record<string, string | number> = {}) {
  const url = new URL(cfg.TMDB_BASE_URL + path);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));
  if (!cfg.TMDB_TOKEN) url.searchParams.set('api_key', cfg.TMDB_API_KEY!);
  const t0 = performance.now();
  const res = await fetch(url, {
    headers: { accept: 'application/json', ...(cfg.TMDB_TOKEN ? { authorization: `Bearer ${cfg.TMDB_TOKEN}` } : {}) },
    signal: AbortSignal.timeout(15_000),
  });
  const ms = Math.round(performance.now() - t0);
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    /* non-JSON */
  }
  return { res, body, ms };
}

const pct = (n: number, d: number) => (d ? `${((n / d) * 100).toFixed(0)}%` : 'n/a');

function shapeStats(label: string, results: unknown[]) {
  const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);
  const r = results.filter(isObj);
  const n = r.length;
  if (results.length !== n) console.log(`         ${results.length - n} result entr${results.length - n === 1 ? 'y was' : 'ies were'} not an object (null/garbage) and are excluded below`);
  const count = (f: (m: Record<string, unknown>) => boolean) => r.filter(f).length;
  const empty = (v: unknown) => v === null || v === undefined || v === '';
  const stats = {
    'title missing/empty': count((m) => empty(m.title)),
    'poster_path null/empty': count((m) => empty(m.poster_path)),
    'backdrop_path null/empty': count((m) => empty(m.backdrop_path)),
    'release_date null/empty': count((m) => empty(m.release_date)),
    'overview empty': count((m) => empty(m.overview)),
    'vote_count == 0': count((m) => m.vote_count === 0),
    'genre_ids empty': count((m) => !Array.isArray(m.genre_ids) || m.genre_ids.length === 0),
    'id not a positive int': count((m) => !Number.isInteger(m.id) || (m.id as number) <= 0),
  };
  console.log(`  shape [${label}] over ${n} items:`);
  for (const [k, v] of Object.entries(stats)) if (v > 0) console.log(`         ${k}: ${v} (${pct(v, n)})`);
  if (Object.values(stats).every((v) => v === 0)) console.log('         all optional fields present in this sample');
  const keys = new Set(r.flatMap((m) => Object.keys(m)));
  const assumed = ['id', 'title', 'original_title', 'release_date', 'poster_path', 'backdrop_path', 'vote_average', 'vote_count', 'genre_ids', 'overview'];
  const missing = assumed.filter((k) => !keys.has(k));
  const fallbackOnly = new Set(['original_title', 'backdrop_path']); // optional for us: a missing one is a note, not a failure
  const hard = missing.filter((k) => !fallbackOnly.has(k));
  if (hard.length) bad(`fields our mapper reads that never appeared in any item: ${hard.join(', ')}`);
  if (missing.length > hard.length) note(`optional fields never appeared: ${missing.filter((k) => fallbackOnly.has(k)).join(', ')}`);
  return stats;
}

async function main() {
  console.log(`TMDB base: ${cfg.TMDB_BASE_URL}  auth: ${cfg.TMDB_TOKEN ? 'bearer token' : 'v3 api_key'}\n`);

  console.log('1) Authentication');
  const auth = await tmdb('/configuration');
  if (auth.res.status === 200) ok(`credentials accepted (${auth.ms} ms)`);
  else {
    bad(`credentials rejected: HTTP ${auth.res.status} ${JSON.stringify(auth.body)}`);
    console.log('\nStopping: fix the token first.');
    process.exit(1);
  }

  console.log('\n2) Endpoints we call, through our mappers');
  const cases: { name: string; path: string; params: Record<string, string | number>; kind: 'page' | 'genres' | 'detail' }[] = [
    { name: 'discover (default)', path: '/discover/movie', params: { include_adult: 'false', sort_by: 'popularity.desc', page: 1 }, kind: 'page' },
    { name: 'discover (rating sort, vote floor)', path: '/discover/movie', params: { sort_by: 'vote_average.desc', 'vote_count.gte': 300, page: 1 }, kind: 'page' },
    { name: 'discover (newest, released only)', path: '/discover/movie', params: { sort_by: 'primary_release_date.desc', 'primary_release_date.lte': new Date().toISOString().slice(0, 10), 'vote_count.gte': 10, page: 1 }, kind: 'page' },
    { name: 'discover (genre 18 + year)', path: '/discover/movie', params: { with_genres: 18, primary_release_year: 1999, page: 1 }, kind: 'page' },
    { name: 'search', path: '/search/movie', params: { query: 'alien', include_adult: 'false', page: 1 }, kind: 'page' },
    { name: 'search (year filter)', path: '/search/movie', params: { query: 'alien', primary_release_year: 1979, page: 1 }, kind: 'page' },
    { name: 'trending', path: '/trending/movie/week', params: { page: 1 }, kind: 'page' },
    { name: 'genres', path: '/genre/movie/list', params: { language: 'en' }, kind: 'genres' },
    { name: 'detail (Fight Club 550)', path: '/movie/550', params: { append_to_response: 'credits,videos,similar' }, kind: 'detail' },
    { name: 'detail (obscure/sparse id 2)', path: '/movie/2', params: { append_to_response: 'credits,videos,similar' }, kind: 'detail' },
  ];

  const headerNames = new Set<string>();
  const latencies: number[] = [];
  const aggregate: unknown[] = [];

  for (const c of cases) {
    const { res, body, ms } = await tmdb(c.path, c.params);
    latencies.push(ms);
    for (const h of res.headers.keys()) if (/rate|limit|retry|cache|age|expires/i.test(h)) headerNames.add(`${h}: ${res.headers.get(h)}`);
    if (res.status !== 200) {
      bad(`${c.name}: HTTP ${res.status} ${JSON.stringify(body)?.slice(0, 200)}`);
      continue;
    }
    try {
      if (c.kind === 'page') {
        const raw = body as { results?: unknown[]; total_pages?: number; total_results?: number };
        const mapped = parseMoviePage(body);
        const dropped = (raw.results?.length ?? 0) - mapped.items.length;
        ok(`${c.name}: ${mapped.items.length}/${raw.results?.length} items kept, total_pages=${raw.total_pages}, total_results=${raw.total_results}, ${ms} ms`);
        if (dropped > 0) note(`${c.name}: mapper dropped ${dropped} item(s) (missing/invalid id or title, or duplicates)`);
        aggregate.push(...(raw.results ?? []));
        if ((raw.total_pages ?? 0) > 500) note(`${c.name}: total_pages=${raw.total_pages} exceeds 500; we cap at 500 (expected)`);
      } else if (c.kind === 'genres') {
        const g = parseGenres(body);
        ok(`${c.name}: ${g.length} genres [${g.slice(0, 5).map((x) => `${x.id}:${x.name}`).join(', ')}, ...], ${ms} ms`);
        if (!g.some((x) => x.id === 18 && x.name === 'Drama')) note('genre id 18 is no longer "Drama": the e2e/mock assumption differs');
      } else {
        const d = parseMovieDetail(body);
        ok(`${c.name}: "${d.title}" cast=${d.cast.length} similar=${d.similar.length} trailer=${d.trailerKey ?? 'none'} runtime=${d.runtimeMinutes ?? 'null'} poster=${d.posterUrl ? 'yes' : 'no'}, ${ms} ms`);
      }
    } catch (e) {
      bad(`${c.name}: our mapper rejected the REAL payload: ${(e as Error).message}`);
    }
  }

  console.log('\n3) How incomplete is real data? (aggregate of every list above)');
  shapeStats('all lists', aggregate);

  console.log('\n4) Paging limits and error shapes');
  const deep = await tmdb('/discover/movie', { page: 500 });
  deep.res.status === 200 ? ok('page 500 is accepted') : note(`page 500 returned HTTP ${deep.res.status}`);
  const over = await tmdb('/discover/movie', { page: 501 });
  over.res.status >= 400 ? ok(`page 501 is rejected with HTTP ${over.res.status} (we cap at 500 before asking)`) : note('page 501 was ACCEPTED: the 500-page cap assumption may be outdated');
  const nf = await tmdb('/movie/999999999');
  nf.res.status === 404 ? ok('unknown movie id -> HTTP 404 (mapped to NOT_FOUND)') : bad(`unknown id returned HTTP ${nf.res.status}, expected 404`);
  const emptySearch = await tmdb('/search/movie', { query: 'zzzzqqqxxxyyy' });
  const es = emptySearch.body as { results?: unknown[]; total_results?: number };
  es.results?.length === 0 ? ok(`nonsense search -> empty results, total_results=${es.total_results} (empty state path)`) : note(`nonsense search returned ${es.results?.length} results`);

  console.log('\n5) Headers');
  console.log(headerNames.size ? [...headerNames].map((h) => `         ${h}`).join('\n') : '         (no rate-limit / retry / cache headers observed on 200 responses)');
  note('TMDB does not document per-response remaining-quota headers; we rely on our own limiter (~40/s) and 429 + Retry-After handling');

  console.log('\n6) Burst test: 30 parallel requests at once (our limiter is NOT in play here; this shows raw TMDB behaviour)');
  // allSettled, not all: a single flaky connection among 30 (common on a VPN) must not abort the rest of verify-tmdb.
  const settled = await Promise.allSettled(
    Array.from({ length: 30 }, (_, i) => tmdb('/discover/movie', { page: 1 + (i % 5), sort_by: 'popularity.desc' })),
  );
  const burst = settled.filter((s) => s.status === 'fulfilled').map((s) => s.value);
  const rejected = settled.length - burst.length;
  const codes = burst.reduce<Record<number, number>>((a, b) => ((a[b.res.status] = (a[b.res.status] ?? 0) + 1), a), {});
  console.log(`         status counts: ${JSON.stringify(codes)}${rejected ? `, ${rejected} request(s) failed to connect` : ''}`);
  if (rejected) note(`${rejected}/30 burst requests failed to connect (likely local network/VPN flakiness under parallel load, not TMDB)`);
  const retryAfter = burst.map((b) => b.res.headers.get('retry-after')).find(Boolean);
  if (codes[429]) note(`TMDB returned 429 under a 30-request burst (Retry-After: ${retryAfter ?? 'absent'}); our limiter + retry exist for this`);
  else if (!rejected) ok('30 parallel requests all succeeded');

  const sorted = [...latencies].sort((a, b) => a - b);
  console.log(`\n   latency: median ${sorted[Math.floor(sorted.length / 2)]} ms, max ${sorted.at(-1)} ms (our timeout is ${cfg.TMDB_TIMEOUT_MS} ms)`);
  if ((sorted.at(-1) ?? 0) > cfg.TMDB_TIMEOUT_MS * 0.7) note('a request took more than 70% of our timeout; consider raising TMDB_TIMEOUT_MS');

  if (OUR_API) {
    console.log(`\n7) Our own API at ${OUR_API} (checks the /api proxy + contract end to end)`);
    for (const [name, path] of [['health', '/api/health'], ['genres', '/api/genres'], ['list', '/api/movies?sort=rating.desc'], ['search', '/api/movies?query=alien'], ['detail', '/api/movies/550']] as const) {
      try {
        const r = await fetch(OUR_API + path, { signal: AbortSignal.timeout(20_000) });
        const j = (await r.json()) as Record<string, unknown>;
        r.ok ? ok(`${name}: HTTP 200${r.headers.get('x-cache') ? ` (X-Cache: ${r.headers.get('x-cache')})` : ''}${Array.isArray(j.items) ? `, ${j.items.length} items` : ''}`) : bad(`${name}: HTTP ${r.status} ${JSON.stringify(j).slice(0, 160)}`);
        if (Array.isArray(j.items) && j.items[0]) {
          const m = j.items[0] as Record<string, unknown>;
          for (const k of ['id', 'title', 'year', 'posterUrl', 'backdropUrl', 'rating', 'voteCount', 'genreIds', 'overview']) if (!(k in m)) bad(`${name}: response item lacks "${k}"`);
        }
      } catch (e) {
        bad(`${name}: ${(e as Error).message} (is the API running?)`);
      }
    }
  }

  console.log(`\n${failures ? `FAILED: ${failures} hard failure(s)` : 'PASSED'}; ${warn.length} note(s) worth reading above.`);
  process.exit(failures ? 1 : 0);
}

main().catch((e) => {
  console.error('verify-tmdb crashed:', e);
  process.exit(1);
});
