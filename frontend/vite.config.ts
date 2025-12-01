import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    chunkSizeWarningLimit: 500,
    rollupOptions: {
      output: {
        manualChunks(id) {
          // Split cytoscape (largest dependency) into its own chunk
          if (id.includes('cytoscape')) {
            return 'cytoscape';
          }
          // Split recharts visualization library
          if (id.includes('recharts') || id.includes('d3-')) {
            return 'recharts';
          }
          // Split React ecosystem
          if (id.includes('react-dom') || id.includes('react-router')) {
            return 'react-vendor';
          }
          // Split UI utilities
          if (id.includes('lucide-react')) {
            return 'ui-utils';
          }
        },
      },
    },
  },
  server: {
    port: 3000,
    strictPort: false,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
      '/ws': {
        target: 'ws://localhost:8080',
        ws: true,
      },
    },
  },
});
