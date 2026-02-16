import { useEffect, useState } from 'react'
import Modal from './Modal'
import type { BeforeInstallPromptEvent } from '../types'

function isIOS() {
  if (typeof navigator === 'undefined') return false
  return /iphone|ipad|ipod/i.test(navigator.userAgent)
}

export default function InstallPwaButton() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [installHint, setInstallHint] = useState<'ios' | 'generic' | null>(null)

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
      setInstallHint('ios')
      return
    }
    if (!deferredPrompt) {
      setInstallHint('generic')
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
        open={installHint !== null}
        title="Install app"
        onClose={() => setInstallHint(null)}
        footer={
          <button
            type="button"
            onClick={() => setInstallHint(null)}
            className="rounded-full bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-500"
          >
            Got it
          </button>
        }
      >
        {installHint === 'ios' ? (
          <p className="leading-relaxed text-sm">
            On iOS Safari, tap the share icon, then choose “Add to Home Screen” to install this app.
          </p>
        ) : (
          <p className="leading-relaxed text-sm">
            This browser does not support the install prompt on this page. Open the browser menu and choose “Install app” or “Add to Home Screen.”
          </p>
        )}
      </Modal>
    </>
  )
}
