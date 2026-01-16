import { useEffect, useState } from 'react'
import type { BeforeInstallPromptEvent } from '../types'

function isIOS() {
  if (typeof navigator === 'undefined') return false
  return /iphone|ipad|ipod/i.test(navigator.userAgent)
}

export default function InstallPwaButton() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [showIOSHint, setShowIOSHint] = useState(false)

  useEffect(() => {
    const handler = (event: Event) => {
      event.preventDefault()
      setDeferredPrompt(event as BeforeInstallPromptEvent)
    }
    window.addEventListener('beforeinstallprompt', handler)
    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  const handleInstall = async () => {
    if (isIOS()) {
      setShowIOSHint(true)
      return
    }
    if (!deferredPrompt) {
      setShowIOSHint(true)
      return
    }
    await deferredPrompt.prompt()
    await deferredPrompt.userChoice
    setDeferredPrompt(null)
  }

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={handleInstall}
        className="rounded-full bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-500"
      >
        Install app
      </button>
      {showIOSHint && (
        <div className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-700">
          On iOS Safari, tap the share icon then “Add to Home Screen”.
        </div>
      )}
    </div>
  )
}
