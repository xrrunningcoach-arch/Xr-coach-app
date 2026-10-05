import { useEffect, useRef } from 'react'

// Ventana modal accesible: se cierra con Escape o pulsando fuera, devuelve el
// foco al elemento que la abrió y bloquea el scroll de la página mientras
// está abierta.
export default function Modal({ title, onClose, children, wide = false }) {
  const panelRef = useRef(null)

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
      className="fixed inset-0 z-50 bg-ink/50 flex items-start justify-center overflow-y-auto p-4 sm:p-8"
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
        className={`bg-white border border-mist rounded-sm w-full ${wide ? 'max-w-3xl' : 'max-w-xl'} my-4 outline-none`}
      >
        <div className="px-5 py-3 bg-bg-dim flex items-center justify-between gap-3">
          <h2 className="font-display text-xl text-navy">{title}</h2>
          <button type="button" onClick={onClose} aria-label="Cerrar" className="text-slate hover:text-red text-sm font-semibold">
            Cerrar
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  )
}
