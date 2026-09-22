import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// The browser only ever talks to /api on its own origin; Vite forwards it to our Node backend.
// (Nothing in the frontend knows TMDB exists, and no API key can leak to the client.)
export default defineConfig({
  plugins: [react()],
  test: { environment: 'jsdom', setupFiles: ['./src/test/setup.ts'], css: false, restoreMocks: true },
  server: { port: 5173, proxy: { '/api': 'http://localhost:4000' } },
});
