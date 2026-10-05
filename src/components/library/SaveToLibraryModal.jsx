import { useState } from 'react'
import Modal from '../Modal'
import { useAuth } from '../../auth/AuthProvider'
import { kindLabel, templateSummary } from '../../lib/templates'
import { saveLibraryItem } from '../../lib/templatesApi'

const inputCls = 'w-full border border-mist rounded-sm px-3 py-2 text-sm focus:outline-none focus:border-navy'
const labelCls = 'block font-mono text-xs text-slate mb-1'

// «Guardar en la biblioteca»: convierte una sesión, mesociclo o macrociclo de
// un atleta en una plantilla sin atleta. El contenido (payload) ya viene
// calculado; aquí solo se pide nombre, descripción y etiquetas.
export default function SaveToLibraryModal({ kind, defaultName, payload, onClose, onSaved }) {
  const { user } = useAuth()
  const [name, setName] = useState(defaultName || '')
  const [description, setDescription] = useState('')
  const [tags, setTags] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [done, setDone] = useState(false)
  const summary = templateSummary(kind, payload)

  async function handleSave(e) {
    e.preventDefault()
    if (!name.trim()) {
      setError('Ponle un nombre.')
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
      })
      setDone(true)
      onSaved?.()
    } catch (err) {
      setError(err.message)
    }
    setSaving(false)
  }

  return (
    <Modal title="Guardar en la biblioteca" onClose={onClose}>
      {done ? (
        <div className="space-y-4">
          <p className="text-sm">«{name}» está en tu biblioteca y puedes aplicarla a cualquier atleta desde la pestaña Biblioteca.</p>
          <button type="button" onClick={onClose} className="px-4 py-2 bg-navy text-white text-sm font-semibold rounded-sm">
            Cerrar
          </button>
        </div>
      ) : (
        <form onSubmit={handleSave} className="space-y-4">
          <p className="font-mono text-xs text-slate">
            {kindLabel(kind)} · {summary.sessions} {summary.sessions === 1 ? 'sesión' : 'sesiones'}
            {summary.weeks ? ` · ${summary.weeks} semanas` : ''}
            {summary.km ? ` · ${summary.km} km` : ''}
          </p>
          <div>
            <label className={labelCls}>Nombre</label>
            <input value={name} onChange={(e) => setName(e.target.value)} className={inputCls} maxLength={120} autoFocus />
          </div>
          <div>
            <label className={labelCls}>Descripción (opcional)</label>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} className={`${inputCls} resize-none`} />
          </div>
          <div>
            <label className={labelCls}>Etiquetas (separadas por comas)</label>
            <input value={tags} onChange={(e) => setTags(e.target.value)} className={inputCls} placeholder="base, 10K, invierno" />
          </div>
          <p className="text-xs text-slate">Se guarda una copia sin datos del atleta (ni estados, ni notas, ni RPE real).</p>
          {error && <p className="text-red text-sm">{error}</p>}
          <div className="flex gap-3">
            <button type="submit" disabled={saving} className="px-5 py-2.5 bg-red hover:bg-red-deep text-white text-sm font-semibold rounded-sm disabled:opacity-60">
              {saving ? 'Guardando…' : 'Guardar'}
            </button>
            <button type="button" onClick={onClose} className="px-4 py-2.5 text-sm text-slate border border-mist rounded-sm hover:border-red hover:text-red">
              Cancelar
            </button>
          </div>
        </form>
      )}
    </Modal>
  )
}
