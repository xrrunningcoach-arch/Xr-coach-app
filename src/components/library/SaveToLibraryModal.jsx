import { useEffect, useState } from 'react'
import Modal from '../Modal'
import { useAuth } from '../../auth/AuthProvider'
import { useT } from '../../i18n'
import { kindLabel, templateSummary } from '../../lib/templates'
import { fetchFolders, saveLibraryItem } from '../../lib/templatesApi'

const inputCls = 'w-full border border-mist rounded-sm px-3 py-2 text-sm focus:outline-none focus:border-navy'
const labelCls = 'block font-mono text-xs text-slate mb-1'

// «Guardar en la biblioteca»: convierte una sesión, mesociclo o macrociclo de
// un atleta en una plantilla sin atleta. El contenido (payload) ya viene
// calculado; aquí solo se pide nombre, descripción, etiquetas y carpeta.
export default function SaveToLibraryModal({ kind, defaultName, payload, onClose, onSaved }) {
  const { user } = useAuth()
  const t = useT()
  const [name, setName] = useState(defaultName || '')
  const [description, setDescription] = useState('')
  const [tags, setTags] = useState('')
  const [folderId, setFolderId] = useState('')
  const [folders, setFolders] = useState(null) // null = sin carpetas disponibles
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [done, setDone] = useState(false)
  const summary = templateSummary(kind, payload)

  useEffect(() => {
    let alive = true
    fetchFolders().then((f) => alive && setFolders(f.available ? f.folders : null))
    return () => {
      alive = false
    }
  }, [])

  async function handleSave(e) {
    e.preventDefault()
    if (!name.trim()) {
      setError(t('tpl.err.name'))
      return
    }
    setSaving(true)
    setError(null)
    try {
      await saveLibraryItem({
        coachId: user.id,
        kind,
        name,
        description,
        tags: tags.split(','),
        payload,
        folderId: folderId || null,
      })
      setDone(true)
      onSaved?.()
    } catch (err) {
      setError(err.message)
    }
    setSaving(false)
  }

  return (
    <Modal title={t('save.title')} onClose={onClose}>
      {done ? (
        <div className="space-y-4">
          <p className="text-sm">{t('save.done', { name })}</p>
          <button type="button" onClick={onClose} className="px-4 py-2 bg-primary text-white text-sm font-semibold rounded-sm">
            {t('common.close')}
          </button>
        </div>
      ) : (
        <form onSubmit={handleSave} className="space-y-4">
          <p className="font-mono text-xs text-slate">
            {kindLabel(kind, t)} · {t('lib.sessionsCount', { count: summary.sessions })}
            {summary.weeks ? ` · ${t('lib.weeks', { count: summary.weeks })}` : ''}
            {summary.km ? ` · ${summary.km} km` : ''}
          </p>
          <div>
            <label className={labelCls}>{t('save.name')}</label>
            <input value={name} onChange={(e) => setName(e.target.value)} className={inputCls} maxLength={120} autoFocus />
          </div>
          <div>
            <label className={labelCls}>{t('save.description')}</label>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} className={`${inputCls} resize-none`} />
          </div>
          <div>
            <label className={labelCls}>{t('save.tags')}</label>
            <input value={tags} onChange={(e) => setTags(e.target.value)} className={inputCls} placeholder={t('save.tagsPh')} />
          </div>
          {folders && (
            <div>
              <label className={labelCls}>{t('lib.folder.field')}</label>
              <select value={folderId} onChange={(e) => setFolderId(e.target.value)} className={inputCls}>
                <option value="">{t('lib.folder.none')}</option>
                {folders.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </select>
            </div>
          )}
          <p className="text-xs text-slate">{t('save.note')}</p>
          {error && <p className="text-red text-sm">{error}</p>}
          <div className="flex gap-3">
            <button type="submit" disabled={saving} className="px-5 py-2.5 bg-brand hover:bg-brand-deep text-white text-sm font-semibold rounded-sm disabled:opacity-60">
              {saving ? t('common.saving') : t('common.save')}
            </button>
            <button type="button" onClick={onClose} className="px-4 py-2.5 text-sm text-slate border border-mist rounded-sm hover:border-red hover:text-red">
              {t('common.cancel')}
            </button>
          </div>
        </form>
      )}
    </Modal>
  )
}
