import { useEffect, useRef } from 'react'
import { useT } from '../i18n'

// Ventana modal accesible: se cierra con Escape o pulsando fuera, devuelve el
// foco al elemento que la abrió y bloquea el scroll de la página mientras
// está abierta.
export default function Modal({ title, onClose, children, wide = false }) {
  const panelRef = useRef(null)
  const t = useT()

  useEffect(() => {
    const previous = document.activeElement
    const onKey = (e) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    panelRef.current?.focus()
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = overflow
      previous?.focus?.()
    }
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 flex items-start justify-center overflow-y-auto p-4 sm:p-8"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className={`bg-surface border border-mist rounded-xl w-full ${wide ? 'max-w-3xl' : 'max-w-xl'} my-4 outline-none`}
      >
        <div className="px-5 py-3 bg-bg-dim flex items-center justify-between gap-3">
          <h2 className="font-display text-xl text-navy">{title}</h2>
          <button type="button" onClick={onClose} aria-label={t('common.close')} className="text-slate hover:text-red text-sm font-semibold">
            {t('common.close')}
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  )
}
