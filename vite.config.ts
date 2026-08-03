import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Dev: `netlify dev` serves functions on :8888; Vite proxies /api there.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // `netlify dev` bundles each function into .netlify/functions-serve/<name>/, and every
    // bundle carries its own nested node_modules. Watching that tree exhausts the watcher
    // and kills the dev server with ENOMEM mid-session. Nothing in there is source.
    watch: {
      ignored: ['**/.netlify/**', '**/dist/**'],
    },
    proxy: {
      '/api': {
        target: process.env.VITE_API_BASE || 'http://127.0.0.1:8888',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
  },
});
