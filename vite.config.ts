/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        // Split the heavy map engine into its own stable-hashed chunk. It's only
        // reached through the lazy DpiMapPage, so this stays an async chunk (loaded
        // only when /dpi-map is visited) — but isolating it means app-code edits no
        // longer invalidate the ~230 kB-gzipped maplibre bundle in returning users'
        // caches, and it downloads in parallel with the page's own code.
        manualChunks(id) {
          if (id.includes('node_modules/maplibre-gl')) return 'maplibre-gl'
        },
      },
    },
  },
  test: {
    environment: 'jsdom',
  },
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:8001',
        changeOrigin: true,
      },
    },
  },
})
