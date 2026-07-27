import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Dev: `netlify dev` serves functions on :8888; Vite proxies /api there.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
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
