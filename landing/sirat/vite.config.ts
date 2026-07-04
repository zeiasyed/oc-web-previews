import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  base: '/oc-web-previews/landing/sirat/',
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/*', 'images/*'],
      manifest: {
        name: 'Sirat - Community Guide',
        short_name: 'Sirat',
        description: 'Your guide to the Shia community of Southern California',
        theme_color: '#2a2a42',
        background_color: '#2a2a42',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/oc-web-previews/landing/sirat/',
        icons: [
          {
            src: 'icons/icon-192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: 'icons/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
          },
          {
            src: 'icons/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,jpg,jpeg,webp}'],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/api\.aladhan\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'prayer-times-cache',
              expiration: {
                maxEntries: 30,
                maxAgeSeconds: 60 * 60 * 24,
              },
            },
          },
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'google-fonts-cache',
            },
          },
        ],
      },
    }),
  ],
})
