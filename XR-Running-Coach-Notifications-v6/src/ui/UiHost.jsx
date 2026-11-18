import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { ui } from './ui'
import { useT } from '../i18n'
import { IconCheck, IconClose, IconAlert } from '../components/icons'

const KIND = {
  success: { cls: 'border-[var(--st-done)]', icon: IconCheck, color: 'text-[var(--st-done)]' },
  error: { cls: 'border-red', icon: IconAlert, color: 'text-red' },
  info: { cls: 'border-navy-light', icon: IconAlert, color: 'text-navy-light' },
}

function Toasts({ toasts }) {
  const t = useT()
  return (
    <div
      className="fixed z-[70] left-0 right-0 bottom-24 md:bottom-6 px-4 flex flex-col items-center gap-2 pointer-events-none"
      aria-live="polite"
      role="status"
    >
      {toasts.map((toast) => {
        const k = KIND[toast.kind] || KIND.info
        const Icon = k.icon
        return (
          <div
            key={toast.id}
            className={`xr-rise pointer-events-auto w-full max-w-md flex items-start gap-3 bg-surface border ${k.cls} rounded-md shadow-lg shadow-black/40 px-4 py-3`}
          >
            <Icon className={`${k.color} shrink-0 mt-0.5`} width={18} height={18} />
            <p className="text-sm text-ink flex-1 break-words">{toast.message}</p>
            <button type="button" onClick={() => ui.dismiss(toast.id)} aria-label={t('common.close')} className="text-slate hover:text-navy shrink-0">
              <IconClose width={16} height={16} />
            </button>
          </div>
        )
      })}
    </div>
  )
}

function ConfirmDialog({ dialog }) {
  const t = useT()
  const [typed, setTyped] = useState('')
  const panel = useRef(null)
  const needText = dialog.requireText
  const ok = !needText || typed.trim() === needText

  useEffect(() => {
    const previous = document.activeElement
    const onKey = (e) => {
      if (e.key === 'Escape') ui._close(false)
    }
    document.addEventListener('keydown', onKey)
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    panel.current?.querySelector('input,button[data-primary]')?.focus()
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = overflow
      previous?.focus?.()
    }
  }, [])

  return (
    <div
      className="xr-fade fixed inset-0 z-[80] bg-black/65 flex items-end sm:items-center justify-center p-4"
      onMouseDown={(e) => e.target === e.currentTarget && ui._close(false)}
    >
      <div
        ref={panel}
        role="alertdialog"
        aria-modal="true"
        aria-label={dialog.title || t('common.confirm')}
        className="xr-rise w-full max-w-md bg-surface border border-mist rounded-lg p-5 shadow-xl shadow-black/50"
      >
        {dialog.title && <h2 className="font-display text-xl text-navy mb-2">{dialog.title}</h2>}
        <p className="text-sm text-ink whitespace-pre-line">{dialog.message}</p>
        {needText && (
          <label className="block mt-4 text-sm text-slate">
            {t('confirm.type', { text: needText })}
            <input
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              className="mt-1 w-full border border-mist rounded-sm px-3 py-2 text-ink"
              autoComplete="off"
            />
          </label>
        )}
        <div className="mt-5 flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
          <button
            type="button"
            onClick={() => ui._close(false)}
            className="px-4 py-2.5 text-sm border border-mist rounded-md text-slate hover:text-navy hover:border-navy-light"
          >
            {dialog.cancelLabel || t('common.cancel')}
          </button>
          <button
            type="button"
            data-primary
            disabled={!ok}
            onClick={() => ui._close(true)}
            className={`px-4 py-2.5 text-sm font-semibold rounded-md text-white disabled:opacity-40 ${
              dialog.danger ? 'bg-brand hover:bg-brand-deep' : 'bg-primary hover:bg-primary-hover'
            }`}
          >
            {dialog.confirmLabel || t('common.accept')}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function UiHost() {
  const state = useSyncExternalStore(ui._subscribe, ui._get)
  return (
    <>
      <Toasts toasts={state.toasts} />
      {state.dialog && <ConfirmDialog key={state.dialog.message} dialog={state.dialog} />}
    </>
  )
}
