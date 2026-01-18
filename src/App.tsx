import { useEffect, useState } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import InstallPwaButton from './components/InstallPwaButton.tsx'
import ListPage from './pages/ListPage.tsx'
import PlaybackPage from './pages/PlaybackPage.tsx'
import PlaylistEditorPage from './pages/PlaylistEditorPage.tsx'
import PlaylistPlaybackPage from './pages/PlaylistPlaybackPage.tsx'
import RecordPage from './pages/RecordPage.tsx'

function useIsPwaInstalled() {
  const [isInstalled, setIsInstalled] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined') return

    const nav = window.navigator as Navigator & { standalone?: boolean }
    const media = window.matchMedia('(display-mode: standalone)')

    const updateInstalled = () => {
      const standalone = media.matches || nav.standalone === true
      setIsInstalled(standalone)
    }

    updateInstalled()

    media.addEventListener?.('change', updateInstalled)
    window.addEventListener('appinstalled', updateInstalled)

    return () => {
      media.removeEventListener?.('change', updateInstalled)
      window.removeEventListener('appinstalled', updateInstalled)
    }
  }, [])

  return isInstalled
}

function Header() {
  return (
    <header className="backdrop-blur-sm bg-white/70 border-b border-slate-200 sticky top-0 z-20 dark:border-slate-800 dark:bg-slate-900/70">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
        <div className="flex items-center gap-2 font-semibold text-slate-900 dark:text-slate-50">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-indigo-600 text-white shadow-sm">
            <span className="text-lg font-bold">EM</span>
          </div>
          <div>
            <div className="text-base">EchoMemo</div>
            <div className="text-xs text-slate-500 dark:text-slate-400">Memorize by looping yourself</div>
          </div>
        </div>
        <InstallPwaButton />
      </div>
    </header>
  )
}

export default function App() {
  const isInstalled = useIsPwaInstalled()

  return (
    <div className="min-h-screen">
      {!isInstalled && <Header />}
      <main className="mx-auto flex max-w-5xl flex-col gap-6 px-4 pb-12 pt-6">
        <Routes>
          {/* Back-compat for PWAs that launch at /index.html */}
          <Route path="/index.html" element={<Navigate to="/" replace />} />
          {/* GitHub Pages SPA fallback copies index.html to 404.html */}
          <Route path="/404.html" element={<Navigate to="/" replace />} />
          <Route path="/" element={<ListPage />} />
          <Route path="/folder/:id" element={<ListPage />} />
          <Route path="/record" element={<RecordPage />} />
          <Route path="/playlist/new" element={<PlaylistEditorPage />} />
          <Route path="/playlist/:id/edit" element={<PlaylistEditorPage />} />
          <Route path="/playlist/:id" element={<PlaylistPlaybackPage />} />
          <Route path="/play/:id" element={<PlaybackPage />} />
        </Routes>
      </main>
    </div>
  )
}
