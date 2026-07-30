import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const apiTarget = process.env.GITSCOPE_API ?? 'http://127.0.0.1:7345';

export default defineConfig({
  plugins: [react()],
  // Relative base so the built bundle also works when Electron loads it from
  // the filesystem rather than over http.
  base: './',
  server: {
    port: 7346,
    strictPort: false,
    proxy: {
      '/api': { target: apiTarget, changeOrigin: true, ws: true },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
    chunkSizeWarningLimit: 1500,
  },
});
