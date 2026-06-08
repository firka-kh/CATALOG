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
        registerType: 'prompt',
        devOptions: { enabled: true },
        manifest: {
          name: 'Региональный Каталог',
          short_name: 'Каталог',
          description: 'Управление каталогом поставщиков',
          theme_color: '#ffffff',
          display: 'standalone',
          icons: [
            {
              src: '192x192.png',
              sizes: '192x192',
              type: 'image/png'
            },
            {
              src: '512x512.png',
              sizes: '512x512',
              type: 'image/png'
            }
          ],
          shortcuts: [
            {
              name: "Открыть корзину",
              short_name: "Корзина",
              description: "Перейти в корзину покупок",
              url: "/?action=cart",
              icons: [{ src: "192x192.png", sizes: "192x192", type: "image/png" }]
            },
            {
              name: "Добавить товар",
              short_name: "Новый товар",
              description: "Добавить новый товар вручную",
              url: "/?action=add-product",
              icons: [{ src: "192x192.png", sizes: "192x192", type: "image/png" }]
            }
          ]
        },
        workbox: {
          globPatterns: ['**/*.{js,css,html,ico,png,svg}']
        }
      })
    ],
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
