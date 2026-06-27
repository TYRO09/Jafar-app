import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      includeAssets: ['model/model.tar.gz'],
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,gz,wasm}'],
        // Increase the maximum file size to cache because the model is ~40MB
        maximumFileSizeToCacheInBytes: 50 * 1024 * 1024,
      },
      manifest: {
        name: 'ESP32 Voice Control',
        short_name: 'ESP Voice',
        description: 'Offline voice control for ESP32',
        theme_color: '#0f172a',
        background_color: '#0f172a',
        display: 'standalone',
        icons: [
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png'
          }
        ]
      }
    })
  ],
  build: {
    minify: false,
    rollupOptions: {
      output: {
        format: 'es'
      }
    }
  }
});
