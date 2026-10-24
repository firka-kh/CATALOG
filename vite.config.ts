import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(() => {
  return {
    plugins: [
      react(), 
      tailwindcss(),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['logo.png', 'apple-touch-icon.png', 'pwa-192x192.png', 'pwa-512x512.png', 'pwa-maskable-512x512.png'],
        manifest: {
          id: '/',
          name: 'SPMEI — Каталог и Мониторинг Цен',
          short_name: 'SPMEI',
          description: 'Рабочее место специалиста по мониторингу цен и региональный каталог оборудования',
          theme_color: '#0f172a',
          background_color: '#0f172a',
          display: 'standalone',
          start_url: '/',
          scope: '/',
          icons: [
            {
              src: '/pwa-192x192.png',
              sizes: '192x192',
              type: 'image/png',
              purpose: 'any'
            },
            {
              src: '/pwa-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'any'
            },
            {
              src: '/pwa-maskable-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'maskable'
            }
          ],
          shortcuts: [
            {
              name: "Панель мониторинга",
              short_name: "Мониторинг",
              description: "Открыть окно мониторинга и аномалий цен без бокового меню",
              url: "/?view=monitoring",
              icons: [{ src: "/pwa-192x192.png", sizes: "192x192", type: "image/png" }]
            },
            {
              name: "Каталог товаров",
              short_name: "Каталог",
              description: "Открыть каталог оборудования и поставщиков",
              url: "/",
              icons: [{ src: "/pwa-192x192.png", sizes: "192x192", type: "image/png" }]
            }
          ]
        },
        workbox: {
          skipWaiting: true,
          clientsClaim: true,
          globPatterns: ['**/*.{js,css,html,ico,png,svg}'],
          maximumFileSizeToCacheInBytes: 10 * 1024 * 1024 // 10 MB
        },
        devOptions: {
          enabled: true,
          type: 'module'
        }
      })
    ],
    build: {
      outDir: 'dist',
      emptyOutDir: false,
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
