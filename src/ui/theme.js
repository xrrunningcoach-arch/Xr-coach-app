import { useCallback, useEffect, useState } from 'react'

const KEY = 'xr.theme'
const COLORS = { dark: '#08130f', light: '#eef4f1' }

function read() {
  const attr = typeof document !== 'undefined' && document.documentElement.getAttribute('data-theme')
  return attr === 'light' ? 'light' : 'dark'
}

export function applyTheme(theme) {
  const t = theme === 'light' ? 'light' : 'dark'
  document.documentElement.setAttribute('data-theme', t)
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', COLORS[t])
  try {
    window.localStorage.setItem(KEY, t)
  } catch {
    /* se ignora */
  }
  return t
}

// Tema oscuro (por defecto) o claro. Se guarda en el dispositivo.
export function useTheme() {
  const [theme, setTheme] = useState(read)

  useEffect(() => {
    const mo = new MutationObserver(() => setTheme(read()))
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    return () => mo.disconnect()
  }, [])

  const toggle = useCallback(() => setTheme(applyTheme(read() === 'dark' ? 'light' : 'dark')), [])
  return { theme, toggle }
}
