import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import es from './es'
import eu from './eu'
import { setDateLang } from '../lib/dates'

// Castellano (es) y euskera (eu). El castellano es el idioma "base": si falta
// una clave en euskera se muestra la de castellano, y si falta en ambos, la
// propia clave (así un fallo es visible en pantalla y no rompe nada).
export const LANGS = [
  { code: 'es', label: 'Castellano', short: 'ES' },
  { code: 'eu', label: 'Euskara', short: 'EU' },
]
const DICTS = { es, eu }
const STORAGE_KEY = 'xr.lang'

function readLang() {
  try {
    const v = window.localStorage.getItem(STORAGE_KEY)
    if (v === 'es' || v === 'eu') return v
  } catch {
    /* sin almacenamiento */
  }
  const nav = (typeof navigator !== 'undefined' && navigator.language) || 'es'
  return nav.toLowerCase().startsWith('eu') ? 'eu' : 'es'
}

let current = typeof window === 'undefined' ? 'es' : readLang()
setDateLang(current)

function interpolate(text, params) {
  if (!params) return text
  return text.replace(/\{(\w+)\}/g, (m, k) => (params[k] === undefined || params[k] === null ? m : String(params[k])))
}

// translate('plan.weeks', { count: 3 }) -> "3 semanas".
// Un valor puede ser texto o { one, other } para plurales (usa params.count).
export function translate(key, params, lang = current) {
  let value = DICTS[lang]?.[key]
  if (value === undefined) value = DICTS.es[key]
  if (value === undefined) return key
  if (value && typeof value === 'object') {
    const n = Number(params?.count)
    value = n === 1 ? value.one : value.other
  }
  return interpolate(String(value), params)
}

// Para código que no es un componente (utilidades, mensajes de error…).
export const tr = (key, params) => translate(key, params, current)
export const getLang = () => current

const LangCtx = createContext({ lang: 'es', setLang: () => {}, t: tr })

export function LangProvider({ children }) {
  const [lang, setLangState] = useState(current)

  const setLang = useCallback((next) => {
    if (next !== 'es' && next !== 'eu') return
    current = next
    setDateLang(next)
    try {
      window.localStorage.setItem(STORAGE_KEY, next)
    } catch {
      /* se ignora */
    }
    setLangState(next)
  }, [])

  useEffect(() => {
    document.documentElement.setAttribute('lang', lang)
  }, [lang])

  const value = useMemo(() => ({ lang, setLang, t: (key, params) => translate(key, params, lang) }), [lang, setLang])
  return <LangCtx.Provider value={value}>{children}</LangCtx.Provider>
}

export const useLang = () => useContext(LangCtx)
export const useT = () => useContext(LangCtx).t

// Al cambiar de idioma se vuelve a montar todo lo de dentro: así también se
// actualizan los textos creados fuera de React (fechas, constantes de módulo).
export function LangBoundary({ children }) {
  const { lang } = useLang()
  return <div key={lang} className="contents">{children}</div>
}
