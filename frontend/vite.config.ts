import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@config': path.resolve(__dirname, './config'),
    },
  },
  server: {
    proxy: {
      '/api': {
        target: process.env.VITE_API_URL ?? 'http://localhost:8070',
        changeOrigin: true,
      },
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'react-vendor': ['react', 'react-dom'],
          'map-vendor': ['maplibre-gl', 'react-map-gl'],
          'deckgl-vendor': [
            '@deck.gl/core',
            '@deck.gl/layers',
            '@deck.gl/mapbox',
            '@loaders.gl/core',
            '@luma.gl/core',
            '@luma.gl/engine',
          ],
          'ui-vendor': [
            '@radix-ui/react-accordion',
            '@radix-ui/react-checkbox',
            '@radix-ui/react-dialog',
            '@radix-ui/react-dropdown-menu',
            '@radix-ui/react-label',
            '@radix-ui/react-popover',
            '@radix-ui/react-radio-group',
            '@radix-ui/react-slot',
            '@radix-ui/react-switch',
            '@radix-ui/react-toggle',
            'lucide-react',
          ],
        },
      },
    },
  },
});
