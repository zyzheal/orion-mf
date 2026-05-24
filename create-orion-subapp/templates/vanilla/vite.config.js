import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    port: 3001,
    cors: true,
  },
  build: {
    target: 'esnext',
    minify: 'esbuild',
  },
});
