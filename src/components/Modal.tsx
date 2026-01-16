import type { ReactNode } from 'react'
import { createPortal } from 'react-dom'

interface Props {
  open: boolean
  title: string
  onClose(): void
  children: ReactNode
  footer?: ReactNode
}

export default function Modal({ open, title, onClose, children, footer }: Props) {
  if (!open) return null

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4" role="dialog" aria-modal>
      <div className="w-full max-w-lg rounded-2xl bg-white shadow-2xl dark:bg-slate-900 dark:shadow-black/50">
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3 dark:border-slate-800">
          <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-50">{title}</h3>
          <button onClick={onClose} className="rounded-full p-2 text-slate-500 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800" aria-label="Close dialog">
            ✕
          </button>
        </div>
        <div className="px-4 pb-4 pt-3 text-slate-700 dark:text-slate-200">{children}</div>
        {footer && <div className="flex items-center justify-end gap-3 border-t border-slate-200 px-4 py-3 dark:border-slate-800">{footer}</div>}
      </div>
    </div>,
    document.body,
  )
}
