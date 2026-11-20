import { useEffect, useState } from 'react'
import { IconChevronLeft, IconChevronRight, IconClose, IconMore } from './icons'
import { useT } from '../i18n'

const STORAGE_KEY = 'xr.sidebar.collapsed'

function readCollapsed() {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

// Navegación del atleta.
//  · Móvil: barra inferior con las secciones "primary" + «Más» (hoja inferior
//    con el resto). Es lo que se toca con el pulgar.
//  · Escritorio: panel lateral colapsable.
//   groups: [{ title, items: [{ id, label, icon, badge?, primary?, short? }] }]
export default function Sidebar({ groups, active, onSelect, ariaLabel }) {
  const t = useT()
  const [collapsed, setCollapsed] = useState(readCollapsed)
  const [sheet, setSheet] = useState(false)

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, collapsed ? '1' : '0')
    } catch {
      /* sin almacenamiento (modo privado): se ignora */
    }
  }, [collapsed])

  useEffect(() => {
    if (!sheet) return undefined
    const onKey = (e) => e.key === 'Escape' && setSheet(false)
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [sheet])

  const flat = groups.flatMap((g) => g.items)
  const primary = flat.filter((i) => i.primary)
  const secondary = flat.filter((i) => !i.primary)
  const moreActive = secondary.some((i) => i.id === active)
  const moreBadge = secondary.reduce((n, i) => n + (Number(i.badge) || 0), 0)

  const pick = (id) => {
    setSheet(false)
    onSelect(id)
  }

  return (
    <>
      {/* Móvil: barra inferior */}
      <nav
        aria-label={ariaLabel}
        className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-surface/95 backdrop-blur border-t border-mist pb-safe"
      >
        <ul className="flex items-stretch justify-around">
          {primary.map((item) => {
            const Icon = item.icon
            const isActive = active === item.id
            return (
              <li key={item.id} className="flex-1">
                <button
                  type="button"
                  onClick={() => pick(item.id)}
                  aria-current={isActive ? 'page' : undefined}
                  className={`relative w-full flex flex-col items-center gap-0.5 pt-2.5 pb-2 text-[11px] font-medium ${
                    isActive ? 'text-navy' : 'text-slate'
                  }`}
                >
                  {isActive && <span className="absolute top-0 h-[3px] w-8 rounded-b bg-brand" />}
                  <span className="relative">
                    <Icon width={22} height={22} />
                    {item.badge ? (
                      <span className="absolute -top-1.5 -right-2.5 min-w-4 h-4 px-1 rounded-full bg-brand text-white font-mono text-[10px] leading-4 text-center">
                        {item.badge}
                      </span>
                    ) : null}
                  </span>
                  <span className="truncate max-w-full px-1">{item.short || item.label}</span>
                </button>
              </li>
            )
          })}
          {secondary.length > 0 && (
            <li className="flex-1">
              <button
                type="button"
                onClick={() => setSheet(true)}
                aria-expanded={sheet}
                aria-haspopup="dialog"
                className={`relative w-full flex flex-col items-center gap-0.5 pt-2.5 pb-2 text-[11px] font-medium ${
                  moreActive ? 'text-navy' : 'text-slate'
                }`}
              >
                {moreActive && <span className="absolute top-0 h-[3px] w-8 rounded-b bg-brand" />}
                <span className="relative">
                  <IconMore width={22} height={22} />
                  {moreBadge ? <span className="absolute -top-0.5 -right-1 w-2.5 h-2.5 rounded-full bg-brand" /> : null}
                </span>
                {t('common.more')}
              </button>
            </li>
          )}
        </ul>
      </nav>

      {sheet && (
        <div
          className="xr-fade md:hidden fixed inset-0 z-50 bg-black/60 flex items-end"
          onMouseDown={(e) => e.target === e.currentTarget && setSheet(false)}
        >
          <div role="dialog" aria-modal="true" aria-label={t('common.more')} className="xr-rise w-full bg-surface border-t border-mist rounded-t-2xl p-4 pb-safe">
            <div className="flex items-center justify-between mb-2 px-1">
              <p className="font-mono text-[11px] uppercase tracking-wide text-navy-light">{t('nav.sections')}</p>
              <button type="button" onClick={() => setSheet(false)} aria-label={t('common.close')} className="text-slate hover:text-navy p-1">
                <IconClose width={20} height={20} />
              </button>
            </div>
            <ul className="space-y-1 pb-4">
              {secondary.map((item) => {
                const Icon = item.icon
                const isActive = active === item.id
                return (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => pick(item.id)}
                      aria-current={isActive ? 'page' : undefined}
                      className={`w-full flex items-center gap-3 px-3 py-3.5 rounded-lg text-left text-sm ${
                        isActive ? 'bg-bg-dim text-navy font-semibold' : 'text-ink hover:bg-bg-dim'
                      }`}
                    >
                      <Icon />
                      <span className="flex-1">{item.label}</span>
                      {item.badge ? <span className="font-mono text-[11px] bg-brand text-white rounded-full px-1.5 py-0.5">{item.badge}</span> : null}
                    </button>
                  </li>
                )
              })}
            </ul>
          </div>
        </div>
      )}

      {/* Escritorio: panel lateral colapsable */}
      <aside
        className={`hidden md:flex flex-col shrink-0 self-start sticky top-24 bg-surface border border-mist rounded-lg transition-[width] duration-200 ${
          collapsed ? 'w-[60px]' : 'w-60'
        }`}
        data-collapsed={collapsed}
      >
        <button
          type="button"
          onClick={() => setCollapsed((v) => !v)}
          aria-expanded={!collapsed}
          aria-label={collapsed ? t('nav.expand') : t('nav.collapse')}
          title={collapsed ? t('nav.expand') : t('nav.collapse')}
          className={`flex items-center gap-2 h-11 px-3 text-slate hover:text-navy border-b border-mist ${
            collapsed ? 'justify-center' : 'justify-between'
          }`}
        >
          {!collapsed && <span className="font-mono text-[11px] uppercase tracking-wide">{t('nav.menu')}</span>}
          {collapsed ? <IconChevronRight /> : <IconChevronLeft />}
        </button>

        <nav aria-label={ariaLabel} className="py-2">
          {groups.map((group, gi) => (
            <div key={group.title || gi} className={gi > 0 ? 'mt-2 pt-2 border-t border-mist' : ''}>
              {group.title && !collapsed && (
                <p className="px-4 pb-1 pt-1 font-mono text-[10px] uppercase tracking-wide text-navy-light">{group.title}</p>
              )}
              {group.items.map((item) => {
                const Icon = item.icon
                const isActive = active === item.id
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => onSelect(item.id)}
                    title={collapsed ? item.label : undefined}
                    aria-label={collapsed ? item.label : undefined}
                    aria-current={isActive ? 'page' : undefined}
                    className={`relative w-full flex items-center gap-3 py-2.5 text-sm transition-colors ${
                      collapsed ? 'justify-center px-0' : 'px-4'
                    } ${isActive ? 'bg-bg-dim text-navy font-semibold' : 'text-slate hover:bg-bg hover:text-navy'}`}
                  >
                    {isActive && <span className="absolute left-0 top-1 bottom-1 w-[3px] bg-brand rounded-r" />}
                    <Icon />
                    {!collapsed && <span className="truncate text-left">{item.label}</span>}
                    {!collapsed && item.badge ? (
                      <span className="ml-auto font-mono text-[11px] bg-brand text-white rounded-full px-1.5 py-0.5">{item.badge}</span>
                    ) : null}
                  </button>
                )
              })}
            </div>
          ))}
        </nav>
      </aside>
    </>
  )
}
