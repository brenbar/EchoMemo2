import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

const repoName = process.env.GITHUB_REPOSITORY?.split('/').pop()?.trim()
const basePath = process.env.GITHUB_PAGES_BASE || (repoName ? `/${repoName}/` : '/EchoMemo3/')

export default defineConfig({
  base: basePath,
  plugins: [
    react(),
    VitePWA({
      // Auto-check for updates; we control install UX ourselves via virtual:pwa-register.
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png', 'icon-192.png', 'icon-512.png', 'EchoMemo192.png', 'EchoMemo512.png'],
      manifest: {
        name: 'EchoMemo',
        short_name: 'EchoMemo',
        // Keep a stable id across deployments and repo subpaths (e.g. /EchoMemo2/).
        // This helps existing installs treat updates as the same app.
        id: basePath,
        // Use the folder root as the start URL so React Router doesn't see "/index.html".
        // (Installed PWAs often launch at start_url, and basename-stripping would leave /index.html.)
        start_url: basePath,
        scope: basePath,
        display: 'standalone',
        background_color: '#f8fafc',
        theme_color: '#0f172a',
        description: 'Record yourself reciting scripts, then loop playback to memorize.',
        icons: [
          {
            src: 'EchoMemo192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: 'EchoMemo512.png',
            sizes: '512x512',
            type: 'image/png',
          },
          {
            src: 'icon-192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: 'icon-512.png',
            sizes: '512x512',
            type: 'image/png',
          },
          {
            src: 'icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        // Make updates apply promptly and reduce "stuck on old shell" risk.
        clientsClaim: true,
        skipWaiting: true,
        globPatterns: ['**/*.{js,css,html,ico,png,svg,json,webmanifest}'],
        navigateFallback: 'index.html',
        // Ensure SPA navigation fallback works under GitHub Pages subpaths like /EchoMemo2/.
        navigateFallbackAllowlist: [new RegExp(`^${basePath}`)],
        runtimeCaching: [
          {
            urlPattern: ({ request }) => request.destination === 'document',
            handler: 'NetworkFirst',
            options: {
              cacheName: 'html-cache',
            },
          },
        ],
      },
      devOptions: {
        enabled: true,
      },
    }),
  ],
})
