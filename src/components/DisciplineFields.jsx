// Renderiza los campos específicos de una disciplina a partir de
// discipline.metrics_schema.fields (ver migración 0002). No conoce de
// antemano qué deportes existen: añadir "Pádel" o "Esquí de fondo" en la
// tabla `disciplines` es suficiente para que aparezca aquí sin tocar código.
import { useT } from '../i18n'

export default function DisciplineFields({ discipline, values, onChange, readOnly = false }) {
  const t = useT()
  const fields = discipline?.metrics_schema?.fields || []

  if (fields.length === 0) {
    return readOnly ? null : (
      <p className="text-xs text-slate italic">{t('disc.noMetrics')}</p>
    )
  }

  function setField(key, value) {
    onChange({ ...values, [key]: value })
  }

  if (readOnly) {
    const withValue = fields.filter((f) => values?.[f.key])
    if (withValue.length === 0) return null
    return (
      <p className="font-mono text-xs text-navy-light">
        {withValue.map((f) => `${f.label}: ${values[f.key]}`).join(' · ')}
      </p>
    )
  }

  return (
    <div className="grid sm:grid-cols-2 gap-3">
      {fields.map((f) => (
        <div key={f.key}>
          <label className="block font-mono text-xs text-slate mb-1">{f.label}</label>
          <input
            type={f.type === 'number' ? 'number' : 'text'}
            value={values?.[f.key] ?? ''}
            onChange={(e) => setField(f.key, f.type === 'number' ? e.target.value : e.target.value)}
            className="w-full border border-mist rounded-sm px-3 py-2 text-sm bg-surface"
          />
        </div>
      ))}
    </div>
  )
}
