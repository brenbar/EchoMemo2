import { useEffect, useState } from 'react'
import Modal from './Modal'
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
    <>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={handleInstall}
          className="rounded-full bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-500"
        >
          Install app
        </button>
      </div>

      <Modal
        open={showIOSHint}
        title="Install on iOS"
        onClose={() => setShowIOSHint(false)}
        footer={
          <button
            type="button"
            onClick={() => setShowIOSHint(false)}
            className="rounded-full bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-500"
          >
            Got it
          </button>
        }
      >
        <p className="leading-relaxed text-sm">
          On iOS Safari, tap the share icon, then choose “Add to Home Screen” to install this app.
        </p>
      </Modal>
    </>
  )
}
