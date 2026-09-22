// Deterministic fake TMDB for end-to-end tests. Not used in production.
//   GET /__down            toggle a 503 outage
//   GET /__delay?ms=N      add N ms latency to every TMDB-style request
//   GET /__log             list of upstream requests seen since the last reset
//   GET /__reset           clear log, outage and latency
import http from 'node:http';

const PORT = Number(process.env.MOCK_TMDB_PORT ?? 4100);
const GENRES = { 28: 'Action', 18: 'Drama', 35: 'Comedy' };
const PAGES = 5; // small on purpose so tests can reach the end of the list
const PER_PAGE = 20;

let down = false;
let delayMs = 0;
let log = [];

const LONG_TITLE =
  'The Extraordinarily Long and Unnecessarily Descriptive Title of a Film That Keeps Going and Going Without Ever Stopping Part II';

function movie(id, title, extra = {}) {
  return {
    id,
    title,
    release_date: `${1980 + (id % 40)}-06-01`,
    poster_path: id % 7 === 0 ? null : '/poster.jpg', // some movies have no poster
    backdrop_path: '/backdrop.jpg',
    vote_average: 5 + (id % 5),
    vote_count: 100 + id,
    genre_ids: [28],
    overview: `Overview for ${title}`,
    ...extra,
  };
}

function listPage(prefix, base, page, total = PAGES) {
  const results = Array.from({ length: PER_PAGE }, (_, i) => {
    const n = (page - 1) * PER_PAGE + i + 1;
    return movie(base + n, n === 3 && page === 1 ? LONG_TITLE : `${prefix} ${n}`);
  });
  results.push({ id: 'garbage' }, null); // real TMDB is not always clean; the backend must survive this
  return { page, total_pages: total, total_results: total * PER_PAGE, results };
}

http
  .createServer((req, res) => {
    const u = new URL(req.url, 'http://mock');
    const send = (code, body) => {
      res.writeHead(code, { 'content-type': 'application/json' });
      res.end(JSON.stringify(body));
    };

    if (u.pathname === '/__down') return send(200, { down: (down = !down) });
    if (u.pathname === '/__delay') return send(200, { delayMs: (delayMs = Number(u.searchParams.get('ms') ?? 0)) });
    if (u.pathname === '/__log') return send(200, log);
    if (u.pathname === '/__reset') {
      down = false;
      delayMs = 0;
      log = [];
      return send(200, { ok: true });
    }

    log.push({ path: u.pathname, query: Object.fromEntries(u.searchParams) });
    setTimeout(() => {
      if (down) return send(503, { status_message: 'down' });
      const page = Number(u.searchParams.get('page') ?? 1);
      if (page > 500) return send(422, { status_message: 'page must be less than or equal to 500' }); // as real TMDB does

      if (u.pathname === '/3/configuration') return send(200, { images: {} });
      if (u.pathname === '/3/genre/movie/list') {
        return send(200, { genres: Object.entries(GENRES).map(([id, name]) => ({ id: Number(id), name })) });
      }
      if (u.pathname === '/3/trending/movie/week') return send(200, listPage('Trending', 500000, page));
      if (u.pathname === '/3/discover/movie') {
        const g = Number(u.searchParams.get('with_genres') ?? 0);
        const prefix = g ? GENRES[g] : 'Popular';
        return send(200, listPage(prefix, g * 1000, page));
      }
      if (u.pathname === '/3/search/movie') {
        const q = u.searchParams.get('query') ?? '';
        if (q.startsWith('zzz')) return send(200, { page: 1, total_pages: 0, total_results: 0, results: [] });
        return send(200, listPage(`Match ${q}`, 900000, page, 2));
      }
      const m = u.pathname.match(/^\/3\/movie\/(\d+)$/);
      if (m) {
        const id = Number(m[1]);
        if (id >= 999999) return send(404, { status_message: 'The resource you requested could not be found.' });
        return send(200, {
          ...movie(id, `Detail ${id}`),
          genres: [{ id: 28, name: 'Action' }],
          runtime: 117,
          tagline: 'A tagline',
          status: 'Released',
          credits: { cast: [{ id: 1, name: 'Actor One', character: 'Hero', order: 0 }] },
          videos: { results: [{ key: 'abc123', site: 'YouTube', type: 'Trailer', official: true }] },
          similar: { results: [movie(id + 1, `Similar ${id + 1}`)] },
        });
      }
      send(404, { status_message: 'not found' });
    }, delayMs);
  })
  .listen(PORT, () => console.log(`mock tmdb on ${PORT}`));
