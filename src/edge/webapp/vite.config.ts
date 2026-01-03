import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  root: path.resolve(__dirname),
  base: '/',
  resolve: {
    alias: {
      '@': path.resolve(__dirname),
      '@p2p': path.resolve(__dirname, '../p2p'),
    },
  },
  server: {
    port: 3000,
    host: '0.0.0.0', // Required for DevPod/Codespaces
    open: false,
  },
  build: {
    outDir: path.resolve(__dirname, '../../../dist/webapp'),
    emptyOutDir: true,
    sourcemap: true,
  },
  define: {
    // Polyfill for Node.js globals in browser
    global: 'globalThis',
  },
});
