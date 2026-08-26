import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    // Use ports well clear of the host's other dev servers (the host has
    // house-build-wiki running on 5173/5174).
    port: 5183,
    strictPort: true,
    proxy: {
      // Proxy API requests to the Node/Express server in dev so React can
      // fetch /api/* on the same origin as the Vite dev server.
      // Use 127.0.0.1 to avoid IPv6/IPv4 localhost resolution mismatch
      // (Vite binds to ::1, which can make `localhost` proxy targets fail).
      '/api': {
        target: 'http://127.0.0.1:5184',
        changeOrigin: true,
      },
    },
  },
});
