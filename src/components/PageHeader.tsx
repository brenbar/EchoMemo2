import type { ReactNode } from 'react'

interface PageHeaderProps {
  title: ReactNode
  onBack?: () => void
  backAriaLabel?: string
  backDisabled?: boolean
  rightSlot?: ReactNode
  titleClassName?: string
}

export default function PageHeader({
  title,
  onBack,
  backAriaLabel = 'Back',
  backDisabled = false,
  rightSlot,
  titleClassName = 'text-lg font-semibold text-slate-900 dark:text-slate-50',
}: PageHeaderProps) {
  return (
    <section className="-mx-4 -mt-6 bg-slate-100/90 px-4 pb-4 pt-4 shadow-sm dark:bg-slate-900/85">
      <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)] items-center gap-3">
        <div className="flex items-center justify-start">
          {onBack && (
            <button
              className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60 dark:text-slate-200 dark:hover:bg-slate-800"
              onClick={onBack}
              aria-label={backAriaLabel}
              disabled={backDisabled}
            >
              <svg
                aria-hidden
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                className="h-4 w-4"
              >
                <path d="M14 18l-6-6 6-6" />
              </svg>
              <span>Back</span>
            </button>
          )}
        </div>
        <h1 className={`min-w-0 truncate text-center ${titleClassName}`}>{title}</h1>
        <div className="flex items-center justify-end">{rightSlot}</div>
      </div>
    </section>
  )
}
