import { defineConfig } from 'vite';

export default defineConfig({
  base: './', // Use relative paths for better portability
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
  },
  server: {
    host: true
  }
});
