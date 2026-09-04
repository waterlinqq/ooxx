import { defineConfig } from 'vite';
import path from 'node:path';

export default defineConfig({
  root: '.',
  resolve: {
    alias: {
      '@ooxx/shared': path.resolve(__dirname, '../../shared'),
    },
  },
  server: {
    proxy: {
      '/api': 'http://localhost:3001',
      '/ws': { target: 'ws://localhost:3001', ws: true },
    },
  },
});
