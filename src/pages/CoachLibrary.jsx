import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../supabaseClient'
import { useAuth } from '../auth/AuthProvider'
import LoadingScreen from '../components/LoadingScreen'
import TemplateEditor from '../components/library/TemplateEditor'
import ApplyTemplateModal from '../components/library/ApplyTemplateModal'
import { fetchDisciplines } from '../lib/disciplines'
import { KINDS, kindLabel, templateSummary } from '../lib/templates'
import { saveLibraryItem } from '../lib/templatesApi'
import { ui } from '../ui/ui'

const FILTERS = [
  { id: 'all', label: 'Todo' },
  { id: 'session', label: 'Sesiones' },
  { id: 'mesocycle', label: 'Planes / mesociclos' },
  { id: 'macrocycle', label: 'Proyectos' },
]

// Biblioteca del entrenador: plantillas de sesiones sueltas, planes
// (mesociclos) y proyectos completos (macrociclos) que no pertenecen a ningún
// atleta. Desde aquí se aplican al calendario de cualquiera de ellos.
export default function CoachLibrary() {
  const { user } = useAuth()
  const [loading, setLoading] = useState(true)
  const [items, setItems] = useState([])
  const [disciplines, setDisciplines] = useState([])
  const [filter, setFilter] = useState('all')
  const [query, setQuery] = useState('')
  const [editing, setEditing] = useState(null) // null | { item?: row, kind?: string }
  const [applying, setApplying] = useState(null)
  const [error, setError] = useState(null)

  async function load() {
    const [{ data, error: err }, disc] = await Promise.all([
      supabase.from('library_items').select('*').order('updated_at', { ascending: false }),
      fetchDisciplines(),
    ])
    if (err) setError(err.message.includes('library_items') ? 'Falta ejecutar la migración 0004 en Supabase (tabla library_items).' : err.message)
    setItems(data || [])
    setDisciplines(disc)
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    return items.filter((i) => {
      if (filter !== 'all' && i.kind !== filter) return false
      if (!q) return true
      return [i.name, i.description, ...(i.tags || [])].some((t) => String(t || '').toLowerCase().includes(q))
    })
  }, [items, filter, query])

  async function handleDuplicate(item) {
    try {
      await saveLibraryItem({
        coachId: user.id,
        kind: item.kind,
        name: `${item.name} (copia)`.slice(0, 120),
        description: item.description,
        tags: item.tags,
        payload: item.payload,
      })
      load()
    } catch (e) {
      ui.error(e.message)
    }
  }

  async function handleDelete(item) {
    if (!(await ui.confirm(`¿Eliminar «${item.name}» de la biblioteca? Los entrenamientos que ya aplicaste a atletas no se tocan.`, { danger: true, confirmLabel: 'Eliminar' }))) return
    const { error: err } = await supabase.from('library_items').delete().eq('id', item.id)
    if (err) ui.error(err.message)
    else load()
  }

  if (loading) return <LoadingScreen />

  if (editing) {
    return (
      <div className="max-w-4xl space-y-4">
        <TemplateEditor
          initial={editing.item || null}
          defaultKind={editing.kind || 'session'}
          disciplines={disciplines}
          onCancel={() => setEditing(null)}
          onSaved={() => {
            setEditing(null)
            load()
          }}
        />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl text-navy">Biblioteca de entrenamientos</h1>
          <p className="text-sm text-slate max-w-2xl">
            Crea y guarda sesiones, planes y proyectos completos sin vincularlos a ningún atleta, y aplícalos al calendario de cualquiera de ellos con un clic.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {KINDS.map((k) => (
            <button
              key={k.id}
              type="button"
              onClick={() => setEditing({ kind: k.id })}
              className={`px-3 py-2 text-xs font-semibold rounded-sm text-white ${k.id === 'session' ? 'bg-brand hover:bg-brand-deep' : 'bg-primary hover:bg-primary-hover'}`}
            >
              + {k.label}
            </button>
          ))}
        </div>
      </div>

      {error && <p className="text-red text-sm">{error}</p>}

      <div className="flex flex-wrap items-center gap-3">
        <div role="group" aria-label="Filtrar por tipo" className="inline-flex flex-wrap border border-mist rounded-sm bg-surface overflow-hidden">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setFilter(f.id)}
              aria-pressed={filter === f.id}
              className={`px-3 py-2 text-sm ${filter === f.id ? 'bg-primary text-white font-semibold' : 'text-slate hover:bg-bg'}`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar por nombre o etiqueta…"
          aria-label="Buscar en la biblioteca"
          className="flex-1 min-w-[200px] max-w-sm border border-mist rounded-sm px-3 py-2 text-sm bg-surface focus:outline-none focus:border-navy"
        />
      </div>

      {visible.length === 0 ? (
        <div className="bg-surface border border-mist rounded-sm p-8 text-center text-slate text-sm">
          {items.length === 0
            ? 'Tu biblioteca está vacía. Crea tu primera plantilla o guarda una sesión, mesociclo o macrociclo de un atleta con «A la biblioteca».'
            : 'Ninguna plantilla coincide con el filtro.'}
        </div>
      ) : (
        <ul className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
          {visible.map((item) => {
            const s = templateSummary(item.kind, item.payload)
            return (
              <li key={item.id} className="bg-surface border border-mist rounded-sm flex flex-col">
                <div className="p-5 flex-1 space-y-2">
                  <p className="font-mono text-[11px] uppercase text-navy-light">{kindLabel(item.kind)}</p>
                  <h2 className="font-display text-lg text-navy leading-snug">{item.name}</h2>
                  {item.description && <p className="text-sm text-slate">{item.description}</p>}
                  <p className="font-mono text-xs text-slate">
                    {s.sessions} {s.sessions === 1 ? 'sesión' : 'sesiones'}
                    {s.weeks ? ` · ${s.weeks} semanas` : ''}
                    {s.km ? ` · ${s.km} km` : ''}
                  </p>
                  {(item.tags || []).length > 0 && (
                    <ul className="flex flex-wrap gap-1.5">
                      {item.tags.map((t) => (
                        <li key={t} className="px-2 py-0.5 rounded-full border border-mist font-mono text-[10px] text-slate">
                          {t}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <div className="px-5 py-3 border-t border-mist flex flex-wrap items-center gap-x-4 gap-y-1">
                  <button type="button" onClick={() => setApplying(item)} className="px-3 py-1.5 bg-brand hover:bg-brand-deep text-white text-xs font-semibold rounded-sm">
                    Aplicar a un atleta
                  </button>
                  <button type="button" onClick={() => setEditing({ item })} className="text-xs font-semibold text-navy hover:text-red">
                    Editar
                  </button>
                  <button type="button" onClick={() => handleDuplicate(item)} className="text-xs font-semibold text-navy hover:text-red">
                    Duplicar
                  </button>
                  <button type="button" onClick={() => handleDelete(item)} className="text-xs text-slate hover:text-red ml-auto">
                    Eliminar
                  </button>
                </div>
              </li>
            )
          })}
        </ul>
      )}

      {applying && <ApplyTemplateModal item={applying} onClose={() => setApplying(null)} />}
    </div>
  )
}
