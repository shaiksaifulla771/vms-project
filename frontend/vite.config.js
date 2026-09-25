import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    // Fail loudly if 3000 is taken (an old copy still running) instead of silently moving to 3001.
    strictPort: true,
    proxy: {
      '/api': { target: process.env.VITE_API_PROXY || 'http://127.0.0.1:5000', changeOrigin: true },
    },
  },
});
