import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  server: { port: 5173, open: false },
  build: {
    target: 'es2022',
    outDir: 'dist',
    sourcemap: true,
  },
  // `.dbml` files are loaded with `?raw`, so tell Vite to treat them as assets.
  assetsInclude: ['**/*.dbml'],
});
