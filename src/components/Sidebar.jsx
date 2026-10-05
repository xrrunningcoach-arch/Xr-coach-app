import { useEffect, useState } from 'react'
import { IconChevronLeft, IconChevronRight } from './icons'

const STORAGE_KEY = 'xr.sidebar.collapsed'

function readCollapsed() {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

// Panel lateral izquierdo desplegable. En pantallas estrechas (< md) se
// convierte en una tira horizontal de pestañas, como las que había antes.
//   groups: [{ title, items: [{ id, label, icon: Component, badge? }] }]
export default function Sidebar({ groups, active, onSelect, ariaLabel = 'Secciones' }) {
  const [collapsed, setCollapsed] = useState(readCollapsed)

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, collapsed ? '1' : '0')
    } catch {
      /* sin almacenamiento (modo privado): se ignora */
    }
  }, [collapsed])

  const flat = groups.flatMap((g) => g.items)

  return (
    <>
      {/* Móvil / tablet pequeña: tira horizontal */}
      <nav aria-label={ariaLabel} className="md:hidden flex gap-1 border-b border-mist overflow-x-auto -mx-5 px-5 sm:-mx-8 sm:px-8">
        {flat.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => onSelect(item.id)}
            aria-current={active === item.id ? 'page' : undefined}
            className={`px-3 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 -mb-px transition-colors ${
              active === item.id ? 'border-red text-red' : 'border-transparent text-slate hover:text-navy'
            }`}
          >
            {item.label}
          </button>
        ))}
      </nav>

      {/* Escritorio: panel lateral colapsable */}
      <aside
        className={`hidden md:flex flex-col shrink-0 self-start sticky top-24 bg-white border border-mist rounded-sm transition-[width] duration-200 ${
          collapsed ? 'w-[60px]' : 'w-60'
        }`}
        data-collapsed={collapsed}
      >
        <button
          type="button"
          onClick={() => setCollapsed((v) => !v)}
          aria-expanded={!collapsed}
          aria-label={collapsed ? 'Desplegar panel lateral' : 'Contraer panel lateral'}
          title={collapsed ? 'Desplegar panel' : 'Contraer panel'}
          className={`flex items-center gap-2 h-11 px-3 text-slate hover:text-navy border-b border-mist ${
            collapsed ? 'justify-center' : 'justify-between'
          }`}
        >
          {!collapsed && <span className="font-mono text-[11px] uppercase tracking-wide">Menú</span>}
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
                    } ${
                      isActive
                        ? 'bg-bg-dim text-navy font-semibold'
                        : 'text-slate hover:bg-bg hover:text-navy'
                    }`}
                  >
                    {isActive && <span className="absolute left-0 top-1 bottom-1 w-[3px] bg-red rounded-r" />}
                    <Icon />
                    {!collapsed && <span className="truncate text-left">{item.label}</span>}
                    {!collapsed && item.badge ? (
                      <span className="ml-auto font-mono text-[11px] bg-red text-white rounded-full px-1.5 py-0.5">{item.badge}</span>
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
