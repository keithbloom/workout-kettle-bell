// vitest's defineConfig accepts the `test` block as well as vite's own options.
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwind from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    tailwind(),
    VitePWA({
      registerType: 'autoUpdate',
      // Registered from main.tsx instead of the injected snippet, which only
      // registers and never reloads — so a deploy took two page loads to
      // appear and the first one silently ran the previous version.
      injectRegister: null,
      includeAssets: ['icon-192.png', 'icon-512.png'],
      manifest: {
        name: 'Kettlebell and mat',
        short_name: 'Kettlebell',
        description:
          'Build and run kettlebell workouts with guided timers. Works without a signal.',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#14161A',
        theme_color: '#14161A',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,svg,woff2}'],
        /*
         * The app shell is precached and served from cache, so it opens with
         * no signal. API calls are deliberately not cached here: the query
         * cache in IndexedDB is what makes the data available offline, and a
         * second cache in front of it would serve answers TanStack Query does
         * not know it has.
         */
        navigateFallback: 'index.html',
        navigateFallbackDenylist: [/^\/api\//],
      },
      devOptions: {
        // Off in development: a service worker caching a dev build makes
        // hot reloading lie to you.
        enabled: false,
      },
    }),
  ],
  server: {
    port: 5173,
    // In production one Worker serves both this app and the API. Proxying in
    // development reproduces that: the browser stays on a single origin, so
    // cookies behave the same way here as they will once deployed.
    proxy: {
      '/api': {
        target: 'http://localhost:8787',
        changeOrigin: true,
      },
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}', 'test/**/*.test.{ts,tsx}'],
  },
});
