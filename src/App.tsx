import { Route, Routes, useLocation } from 'react-router-dom'
import ListPage from './pages/ListPage.tsx'
import PlaybackPage from './pages/PlaybackPage.tsx'
import RecordPage from './pages/RecordPage.tsx'

function Header() {
  const location = useLocation()

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
        <nav className="flex items-center gap-3 text-sm font-medium text-slate-600 dark:text-slate-300">
          <span className={location.pathname === '/' ? 'text-indigo-600 dark:text-indigo-300' : ''}>Library</span>
          <span className={location.pathname.startsWith('/record') ? 'text-indigo-600 dark:text-indigo-300' : ''}>Record</span>
        </nav>
      </div>
    </header>
  )
}

export default function App() {
  return (
    <div className="min-h-screen">
      <Header />
      <main className="mx-auto flex max-w-5xl flex-col gap-6 px-4 pb-12 pt-6">
        <Routes>
          <Route path="/" element={<ListPage />} />
          <Route path="/record" element={<RecordPage />} />
          <Route path="/play/:id" element={<PlaybackPage />} />
        </Routes>
      </main>
    </div>
  )
}
