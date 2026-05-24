import { defineConfig } from 'vite';
import vue2 from '@vitejs/plugin-vue2';

export default defineConfig({
  plugins: [vue2()],
  server: {
    port: 3001,
    cors: true,
  },
  build: {
    target: 'esnext',
    minify: 'esbuild',
  },
});
