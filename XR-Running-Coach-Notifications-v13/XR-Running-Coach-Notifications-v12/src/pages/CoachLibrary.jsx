import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../supabaseClient'
import { useAuth } from '../auth/AuthProvider'
import { useT } from '../i18n'
import LoadingScreen from '../components/LoadingScreen'
import TemplateEditor from '../components/library/TemplateEditor'
import ApplyTemplateModal from '../components/library/ApplyTemplateModal'
import { fetchDisciplines } from '../lib/disciplines'
import { KINDS, kindLabel, templateSummary } from '../lib/templates'
import { createFolder, deleteFolder, fetchFolders, moveItemToFolder, renameFolder, saveLibraryItem } from '../lib/templatesApi'
import { ui } from '../ui/ui'

const FILTERS = ['all', 'session', 'mesocycle', 'macrocycle']
const chip = (active) =>
  `px-3 py-1.5 text-sm rounded-full border transition-colors ${
    active ? 'bg-primary text-white border-primary font-semibold' : 'border-mist text-slate hover:text-navy hover:border-navy-light'
  }`

// Biblioteca del entrenador: plantillas de sesiones sueltas, planes (mesociclos) y
// proyectos completos (macrociclos) que no pertenecen a ningún atleta, ordenadas en
// carpetas propias. Desde aquí se aplican al calendario de uno o varios atletas.
export default function CoachLibrary() {
  const t = useT()
  const { user } = useAuth()
  const [loading, setLoading] = useState(true)
  const [items, setItems] = useState([])
  const [folders, setFolders] = useState([])
  const [foldersOk, setFoldersOk] = useState(true)
  const [disciplines, setDisciplines] = useState([])
  const [filter, setFilter] = useState('all')
  const [folderFilter, setFolderFilter] = useState('all') // 'all' | 'none' | id
  const [query, setQuery] = useState('')
  const [editing, setEditing] = useState(null) // null | { item?: row, kind?: string }
  const [applying, setApplying] = useState(null)
  const [error, setError] = useState(null)
  const [newName, setNewName] = useState(null) // null = cerrado
  const [renameName, setRenameName] = useState(null) // null = no se está renombrando

  async function load() {
    const [{ data, error: err }, disc, f] = await Promise.all([
      supabase.from('library_items').select('*').order('updated_at', { ascending: false }),
      fetchDisciplines(),
      fetchFolders(),
    ])
    if (err) setError(err.message.includes('library_items') ? t('lib.missingMigration') : err.message)
    setItems(data || [])
    setDisciplines(disc)
    setFolders(f.folders)
    setFoldersOk(f.available)
    // Si la carpeta elegida ya no existe, se vuelve a «Todas».
    setFolderFilter((cur) => (cur === 'all' || cur === 'none' || f.folders.some((x) => x.id === cur) ? cur : 'all'))
    setLoading(false)
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const countByFolder = useMemo(() => {
    const map = { none: 0 }
    items.forEach((i) => {
      const k = i.folder_id || 'none'
      map[k] = (map[k] || 0) + 1
    })
    return map
  }, [items])

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    return items.filter((i) => {
      if (filter !== 'all' && i.kind !== filter) return false
      if (folderFilter === 'none' && i.folder_id) return false
      if (folderFilter !== 'all' && folderFilter !== 'none' && i.folder_id !== folderFilter) return false
      if (!q) return true
      return [i.name, i.description, ...(i.tags || [])].some((x) => String(x || '').toLowerCase().includes(q))
    })
  }, [items, filter, folderFilter, query])

  const currentFolder = folders.find((f) => f.id === folderFilter) || null

  const folderError = (e) => ui.error(e?.code === '23505' ? t('lib.folder.exists') : e.message)

  async function handleCreateFolder(e) {
    e.preventDefault()
    const name = (newName || '').trim()
    if (!name) return
    try {
      const f = await createFolder(user.id, name)
      setNewName(null)
      await load()
      setFolderFilter(f.id)
    } catch (err) {
      folderError(err)
    }
  }

  async function handleRename(e) {
    e.preventDefault()
    const name = (renameName || '').trim()
    if (!name || !currentFolder) return
    try {
      await renameFolder(currentFolder.id, name)
      setRenameName(null)
      load()
    } catch (err) {
      folderError(err)
    }
  }

  async function handleDeleteFolder() {
    if (!currentFolder) return
    if (!(await ui.confirm(t('lib.folder.confirmDelete', { name: currentFolder.name }), { danger: true, confirmLabel: t('lib.folder.delete') }))) return
    try {
      await deleteFolder(currentFolder.id)
      setFolderFilter('all')
      load()
    } catch (err) {
      ui.error(err.message)
    }
  }

  async function handleMove(item, folderId) {
    try {
      await moveItemToFolder(item.id, folderId)
      ui.success(t('lib.folder.moved'))
      load()
    } catch (err) {
      ui.error(err.message)
    }
  }

  async function handleDuplicate(item) {
    try {
      await saveLibraryItem({
        coachId: user.id,
        kind: item.kind,
        name: `${item.name}${t('lib.copySuffix')}`.slice(0, 120),
        description: item.description,
        tags: item.tags,
        payload: item.payload,
        folderId: item.folder_id,
      })
      load()
    } catch (e) {
      ui.error(e.message)
    }
  }

  async function handleDelete(item) {
    if (!(await ui.confirm(t('lib.confirmDelete', { name: item.name }), { danger: true, confirmLabel: t('lib.delete') }))) return
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
          folders={foldersOk ? folders : null}
          defaultFolderId={folderFilter !== 'all' && folderFilter !== 'none' ? folderFilter : ''}
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
          <h1 className="font-display text-2xl text-navy">{t('lib.title')}</h1>
          <p className="text-sm text-slate max-w-2xl">{t('lib.intro')}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {KINDS.map((k) => (
            <button
              key={k.id}
              type="button"
              onClick={() => setEditing({ kind: k.id })}
              className={`px-3 py-2 text-xs font-semibold rounded-sm text-white ${k.id === 'session' ? 'bg-brand hover:bg-brand-deep' : 'bg-primary hover:bg-primary-hover'}`}
            >
              + {kindLabel(k.id, t)}
            </button>
          ))}
        </div>
      </div>

      {error && <p className="text-red text-sm">{error}</p>}

      {/* Carpetas */}
      <section aria-label={t('lib.folders')} className="space-y-2">
        {foldersOk ? (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" onClick={() => setFolderFilter('all')} aria-pressed={folderFilter === 'all'} className={chip(folderFilter === 'all')}>
                {t('lib.folder.all')} ({items.length})
              </button>
              <button type="button" onClick={() => setFolderFilter('none')} aria-pressed={folderFilter === 'none'} className={chip(folderFilter === 'none')}>
                {t('lib.folder.none')} ({countByFolder.none || 0})
              </button>
              {folders.map((f) => (
                <button key={f.id} type="button" onClick={() => { setFolderFilter(f.id); setRenameName(null) }} aria-pressed={folderFilter === f.id} className={chip(folderFilter === f.id)}>
                  {f.name} ({countByFolder[f.id] || 0})
                </button>
              ))}
              <button type="button" onClick={() => setNewName(newName === null ? '' : null)} className="px-3 py-1.5 text-sm font-semibold text-navy border border-dashed border-navy-light rounded-full hover:bg-bg-dim">
                + {t('lib.folder.new')}
              </button>
            </div>

            {newName !== null && (
              <form onSubmit={handleCreateFolder} className="flex flex-wrap items-center gap-2">
                <input
                  autoFocus
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  maxLength={60}
                  placeholder={t('lib.folder.name')}
                  aria-label={t('lib.folder.name')}
                  className="border border-mist rounded-sm px-3 py-2 text-sm bg-surface focus:outline-none focus:border-navy"
                />
                <button type="submit" disabled={!newName.trim()} className="px-3 py-2 bg-primary hover:bg-primary-hover text-white text-sm font-semibold rounded-sm disabled:opacity-60">
                  {t('lib.folder.create')}
                </button>
                <button type="button" onClick={() => setNewName(null)} className="px-3 py-2 text-sm text-slate border border-mist rounded-sm hover:border-red hover:text-red">
                  {t('common.cancel')}
                </button>
              </form>
            )}

            {currentFolder && (
              <div className="flex flex-wrap items-center gap-3">
                {renameName === null ? (
                  <>
                    <button type="button" onClick={() => setRenameName(currentFolder.name)} className="text-xs font-semibold text-navy hover:text-red">
                      {t('lib.folder.rename')}
                    </button>
                    <button type="button" onClick={handleDeleteFolder} className="text-xs font-semibold text-slate hover:text-red">
                      {t('lib.folder.delete')}
                    </button>
                  </>
                ) : (
                  <form onSubmit={handleRename} className="flex flex-wrap items-center gap-2">
                    <input
                      autoFocus
                      value={renameName}
                      onChange={(e) => setRenameName(e.target.value)}
                      maxLength={60}
                      aria-label={t('lib.folder.name')}
                      className="border border-mist rounded-sm px-3 py-1.5 text-sm bg-surface focus:outline-none focus:border-navy"
                    />
                    <button type="submit" disabled={!renameName.trim()} className="px-3 py-1.5 bg-primary hover:bg-primary-hover text-white text-xs font-semibold rounded-sm disabled:opacity-60">
                      {t('common.save')}
                    </button>
                    <button type="button" onClick={() => setRenameName(null)} className="px-3 py-1.5 text-xs text-slate border border-mist rounded-sm hover:border-red hover:text-red">
                      {t('common.cancel')}
                    </button>
                  </form>
                )}
              </div>
            )}
          </>
        ) : (
          <p className="text-xs text-slate">{t('lib.missingFolders')}</p>
        )}
      </section>

      <div className="flex flex-wrap items-center gap-3">
        <div role="group" aria-label={t('lib.filterType')} className="inline-flex flex-wrap border border-mist rounded-sm bg-surface overflow-hidden">
          {FILTERS.map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              aria-pressed={filter === f}
              className={`px-3 py-2 text-sm ${filter === f ? 'bg-primary text-white font-semibold' : 'text-slate hover:bg-bg'}`}
            >
              {t(`lib.filter.${f}`)}
            </button>
          ))}
        </div>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('lib.search')}
          aria-label={t('lib.searchAria')}
          className="flex-1 min-w-[200px] max-w-sm border border-mist rounded-sm px-3 py-2 text-sm bg-surface focus:outline-none focus:border-navy"
        />
      </div>

      {visible.length === 0 ? (
        <div className="bg-surface border border-mist rounded-sm p-8 text-center text-slate text-sm">
          {items.length === 0 ? t('lib.empty') : t('lib.noMatch')}
        </div>
      ) : (
        <ul className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
          {visible.map((item) => {
            const s = templateSummary(item.kind, item.payload)
            return (
              <li key={item.id} className="bg-surface border border-mist rounded-sm flex flex-col">
                <div className="p-5 flex-1 space-y-2">
                  <p className="font-mono text-[11px] uppercase text-navy-light">{kindLabel(item.kind, t)}</p>
                  <h2 className="font-display text-lg text-navy leading-snug">{item.name}</h2>
                  {item.description && <p className="text-sm text-slate">{item.description}</p>}
                  <p className="font-mono text-xs text-slate">
                    {t('lib.sessionsCount', { count: s.sessions })}
                    {s.weeks ? ` · ${t('lib.weeks', { count: s.weeks })}` : ''}
                    {s.km ? ` · ${s.km} km` : ''}
                  </p>
                  {(item.tags || []).length > 0 && (
                    <ul className="flex flex-wrap gap-1.5">
                      {item.tags.map((tag) => (
                        <li key={tag} className="px-2 py-0.5 rounded-full border border-mist font-mono text-[10px] text-slate">
                          {tag}
                        </li>
                      ))}
                    </ul>
                  )}
                  {foldersOk && (
                    <label className="block pt-1">
                      <span className="sr-only">{t('lib.folder.move')}</span>
                      <select
                        value={item.folder_id || ''}
                        onChange={(e) => handleMove(item, e.target.value)}
                        className="w-full border border-mist rounded-sm px-2 py-1.5 text-xs bg-surface text-slate"
                      >
                        <option value="">{t('lib.folder.none')}</option>
                        {folders.map((f) => (
                          <option key={f.id} value={f.id}>
                            {f.name}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                </div>
                <div className="px-5 py-3 border-t border-mist flex flex-wrap items-center gap-x-4 gap-y-1">
                  <button type="button" onClick={() => setApplying(item)} className="px-3 py-1.5 bg-brand hover:bg-brand-deep text-white text-xs font-semibold rounded-sm">
                    {t('lib.apply')}
                  </button>
                  <button type="button" onClick={() => setEditing({ item })} className="text-xs font-semibold text-navy hover:text-red">
                    {t('lib.edit')}
                  </button>
                  <button type="button" onClick={() => handleDuplicate(item)} className="text-xs font-semibold text-navy hover:text-red">
                    {t('lib.duplicate')}
                  </button>
                  <button type="button" onClick={() => handleDelete(item)} className="text-xs text-slate hover:text-red ml-auto">
                    {t('lib.delete')}
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
