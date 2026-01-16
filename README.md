# EchoMemo PWA

Record yourself reading scripts, save the audio locally in IndexedDB, and loop playback to memorize. Built with Vite, React, TypeScript, Tailwind, and Playwright.

## Commands

- `npm run dev` – start the dev server
- `npm run build` – type-check and build production assets (also writes `dist/404.html` for GitHub Pages SPA fallback)
- `npm run preview` – preview the production build
- `npm run test:e2e` – Playwright smoke test (Chromium)

## GitHub Pages / SPA

- `vite.config.ts` sets `base` using `GITHUB_PAGES_BASE` or the repo name (`/echomemo3/` fallback). Set `GITHUB_PAGES_BASE=/your-repo/` when building if you host from a different path.
- `postbuild` copies `dist/index.html` to `dist/404.html` so GitHub Pages routes fallback to your SPA.

## PWA notes

- Manifest and service worker generated via `vite-plugin-pwa`; icons live in `public/`.
- Install button listens for `beforeinstallprompt`. On iOS Safari (no prompt support) users see “Share → Add to Home Screen”.
- Meta tags in `index.html` enable iOS standalone mode.

## Recording + storage

- Audio is captured with `MediaRecorder` (prefers `audio/mp4` when supported; falls back to default) and stored in IndexedDB along with duration, size, and script text.
- Playback view auto-loops the selected recording.

## Testing Safari/iOS

- Use a secure origin (https or `localhost`).
- Keep the recording page in the foreground while capturing audio; backgrounding Safari can stop the stream.

