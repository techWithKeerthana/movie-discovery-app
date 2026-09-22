const token = process.env.TMDB_TOKEN;
console.log('Token present:', !!token);
console.log('Token length:', token?.length);

fetch(`https://api.themoviedb.org/3/movie/popular?api_key=${token}&page=1`)
  .then(r => {
    console.log('TMDB status:', r.status);
    return r.json();
  })
  .then(d => {
    if (d.results) {
      console.log('SUCCESS - got', d.results.length, 'movies');
    } else {
      console.log('TMDB error response:', JSON.stringify(d));
    }
  })
  .catch(e => console.log('NETWORK FAILED:', e.message));