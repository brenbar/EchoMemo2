import { useEffect, useId, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

interface Props {
  open: boolean
  title: string
  onClose(): void
  children: ReactNode
  footer?: ReactNode
  panelClassName?: string
  bodyClassName?: string
  hideCloseButton?: boolean
  closeOnEscape?: boolean
  testId?: string
}

const FOCUSABLE_SELECTOR = [
  'button:not([disabled])',
  '[href]',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

function getFocusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (element) => !element.hasAttribute('disabled') && element.getAttribute('aria-hidden') !== 'true',
  )
}

export default function Modal({
  open,
  title,
  onClose,
  children,
  footer,
  panelClassName,
  bodyClassName,
  hideCloseButton = false,
  closeOnEscape = true,
  testId,
}: Props) {
  const panelRef = useRef<HTMLDivElement | null>(null)
  const previousFocusRef = useRef<HTMLElement | null>(null)
  const onCloseRef = useRef(onClose)
  const closeOnEscapeRef = useRef(closeOnEscape)
  const titleId = useId()

  useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

  useEffect(() => {
    closeOnEscapeRef.current = closeOnEscape
  }, [closeOnEscape])

  useEffect(() => {
    if (!open) return undefined

    previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const panel = panelRef.current
    if (!panel) return undefined

    const initialFocus = getFocusableElements(panel)[0] ?? panel
    initialFocus.focus()

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && closeOnEscapeRef.current) {
        event.preventDefault()
        onCloseRef.current()
        return
      }

      if (event.key !== 'Tab') return

      const focusables = getFocusableElements(panel)
      if (focusables.length === 0) {
        event.preventDefault()
        panel.focus()
        return
      }

      const current = document.activeElement as HTMLElement | null
      const currentIndex = current ? focusables.indexOf(current) : -1

      if (event.shiftKey) {
        if (currentIndex <= 0) {
          event.preventDefault()
          focusables[focusables.length - 1]?.focus()
        }
        return
      }

      if (currentIndex === -1 || currentIndex >= focusables.length - 1) {
        event.preventDefault()
        focusables[0]?.focus()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      const previous = previousFocusRef.current
      window.setTimeout(() => {
        if (previous && document.contains(previous)) {
          previous.focus()
        }
      }, 0)
    }
  }, [open])

  if (!open) return null

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4 py-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      data-testid={testId}
    >
      <div
        ref={panelRef}
        tabIndex={-1}
        data-testid="modal-panel"
        className={`flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-white shadow-2xl dark:bg-slate-900 dark:shadow-black/50 ${panelClassName ?? ''}`}
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3 dark:border-slate-800">
          <h3 id={titleId} className="text-lg font-semibold text-slate-900 dark:text-slate-50">{title}</h3>
          {!hideCloseButton && (
            <button onClick={onClose} className="rounded-full p-2 text-slate-500 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800" aria-label="Close dialog">
              ✕
            </button>
          )}
        </div>
        <div className={`flex min-h-0 flex-1 flex-col overflow-y-auto px-4 pb-4 pt-3 text-slate-700 dark:text-slate-200 ${bodyClassName ?? ''}`}>{children}</div>
        {footer && <div className="flex items-center justify-end gap-3 border-t border-slate-200 px-4 py-3 dark:border-slate-800">{footer}</div>}
      </div>
    </div>,
    document.body,
  )
}
