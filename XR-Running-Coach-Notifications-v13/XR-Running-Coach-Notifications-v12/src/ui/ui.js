// Avisos y confirmaciones propios (sustituyen a alert / confirm / prompt del
// navegador, que son feos, bloquean la página y fallan en móviles/PWA).
//
//   ui.success('Guardado')      ui.error(err.message)      ui.info('…')
//   if (await ui.confirm('¿Eliminar?', { danger: true })) …
//   await ui.confirm('Escribe ELIMINAR', { requireText: 'ELIMINAR' })
const listeners = new Set()
let state = { toasts: [], dialog: null }
let seq = 0

function emit() {
  state = { ...state }
  listeners.forEach((l) => l())
}

function push(kind, message, ms) {
  if (!message) return
  const id = ++seq
  const toast = { id, kind, message: String(message) }
  state.toasts = [...state.toasts.slice(-3), toast]
  emit()
  const life = ms ?? (kind === 'error' ? 7000 : 3500)
  setTimeout(() => ui.dismiss(id), life)
  return id
}

export const ui = {
  success: (m, ms) => push('success', m, ms),
  error: (m, ms) => push('error', m && m.message ? m.message : m, ms),
  info: (m, ms) => push('info', m, ms),
  dismiss(id) {
    state.toasts = state.toasts.filter((t) => t.id !== id)
    emit()
  },
  // Devuelve una promesa: true si el usuario acepta, false si cancela.
  confirm(message, opts = {}) {
    return new Promise((resolve) => {
      if (state.dialog) state.dialog.resolve(false)
      state.dialog = { message, ...opts, resolve }
      emit()
    })
  },
  _close(result) {
    const d = state.dialog
    state.dialog = null
    emit()
    if (d) d.resolve(result)
  },
  _subscribe(l) {
    listeners.add(l)
    return () => listeners.delete(l)
  },
  _get: () => state,
}
