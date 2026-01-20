import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react-swc'
import { VitePWA } from 'vite-plugin-pwa'
import path from 'path'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const enablePwaDev = env.VITE_PWA_DEV === 'true'

  return {
    plugins: [
      react(),
      VitePWA({
        registerType: 'prompt',
        devOptions: {
          enabled: enablePwaDev,
          type: 'module',
        },
        includeAssets: ['icons/icon.svg'],
        manifest: {
          name: 'Participa DF — Ouvidoria',
          short_name: 'Participa DF',
          description:
            'PWA acessível para registro de manifestações por texto, áudio, imagem e vídeo, com protocolo e opção de anonimato.',
          start_url: '/',
          display: 'standalone',
          background_color: '#0B1220',
          theme_color: '#2563EB',
          icons: [
            {
              src: '/icons/icon.svg',
              sizes: 'any',
              type: 'image/svg+xml',
              purpose: 'any maskable',
            },
          ],
        },
        workbox: {
          navigateFallback: '/',
          runtimeCaching: [
            {
              urlPattern: ({ request }) => request.destination === 'document',
              handler: 'NetworkFirst',
              options: { cacheName: 'pages', networkTimeoutSeconds: 3 },
            },
          ],
        },
      }),
    ],

    resolve: {
      alias: {
        '@': path.resolve(__dirname, 'src'),
      },
    },

    server: {
      proxy: {
        // frontend chama /api/* e o Vite encaminha para o backend (sem CORS)
        '/api': {
          target: 'http://localhost:8000',
          changeOrigin: true,
          secure: false,
        },
      },
    },

    // evita prebundle agressivo para transformers em alguns ambientes
    optimizeDeps: {
      exclude: ['@xenova/transformers'],
    },
  }
})
