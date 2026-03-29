import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueDevTools from 'vite-plugin-vue-devtools'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    vue(),
    vueDevTools(),
    VitePWA({
      registerType: 'autoUpdate',
      workbox: {
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/devoted-solace-production\.up\.railway\.app\/.*/i,
            handler: 'NetworkOnly',
          },
        ],
      },
      manifest: {
        name: 'AR Monument Tour',
        short_name: 'ARTour',
        description: 'Real-time AR monument guide based on your location.',
        start_url: '/',
        display: 'standalone',
        background_color: '#ffffff',
        theme_color: '#2c3e50',
        orientation: 'portrait-primary',
        scope: '/',
        lang: 'en',
        categories: ['travel', 'navigation', 'education'],
        icons: [
          {
            src: '/image/walking.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: '/image/walking.png',
            sizes: '512x512',
            type: 'image/png',
          },
          {
            src: '/image/walking.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
})
