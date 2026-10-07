import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../supabaseClient'
import { HR_ZONES, manualZoneWarnings, parseManualForm, resolveZones } from '../lib/zones'

const inputCls = 'w-24 border border-mist rounded-sm px-2 py-1.5 text-sm font-mono bg-surface focus:outline-none focus:border-navy'

function toFields(manualZones) {
  const out = {}
  HR_ZONES.forEach((z) => {
    out[z.code] = { lo: manualZones?.[z.code]?.lo ?? '', hi: manualZones?.[z.code]?.hi ?? '' }
  })
  return out
}

// Panel del entrenador para fijar a mano las zonas de FC de UN atleta. Cada
// zona rellenada tiene prioridad sobre el cálculo automático (% de la FC
// máxima); las zonas vacías siguen siendo automáticas.
export default function HrZonesManual({ athleteId, coachId, maxHr, manualZones, onPreview, onSaved }) {
  const [fields, setFields] = useState(() => toFields(manualZones))
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState(null)

  const { zones, errors } = useMemo(() => parseManualForm(fields), [fields])
  const warnings = useMemo(() => manualZoneWarnings(zones), [zones])
  const auto = useMemo(() => resolveZones({ maxHr, manualZones: {} }), [maxHr])

  useEffect(() => {
    onPreview?.(zones)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zones])

  const hasErrors = Object.keys(errors).length > 0
  const hadManual = Object.keys(manualZones || {}).length > 0

  function setField(code, key, value) {
    setMessage(null)
    setFields((f) => ({ ...f, [code]: { ...f[code], [key]: value } }))
  }

  function copyAuto() {
    setMessage(null)
    const next = {}
    auto.forEach((z) => {
      next[z.code] = { lo: z.range?.[0] ?? '', hi: z.range?.[1] ?? '' }
    })
    setFields(next)
  }

  async function handleSave() {
    if (hasErrors) return
    setSaving(true)
    setMessage(null)
    let error = null
    if (Object.keys(zones).length === 0) {
      if (hadManual) ({ error } = await supabase.from('athlete_hr_zones').delete().eq('athlete_id', athleteId))
    } else {
      ;({ error } = await supabase
        .from('athlete_hr_zones')
        .upsert({ athlete_id: athleteId, manual_zones: zones, updated_by: coachId }))
    }
    setSaving(false)
    if (error) {
      setMessage({ ok: false, text: error.message })
      return
    }
    setMessage({
      ok: true,
      text: Object.keys(zones).length ? 'Zonas manuales guardadas. El atleta ya las ve.' : 'Vuelven a usarse las zonas automáticas.',
    })
    onSaved?.()
  }

  return (
    <div className="bg-surface border border-mist rounded-sm overflow-hidden">
      <div className="px-5 py-3 bg-bg-dim flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="font-display text-lg text-navy">Zonas manuales de este atleta</h3>
          <p className="font-mono text-[11px] text-slate">Lo que escribas aquí tiene prioridad sobre el cálculo automático</p>
        </div>
        <button type="button" onClick={copyAuto} className="text-sm font-semibold text-navy hover:text-red">
          Copiar valores automáticos
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[560px]">
          <thead>
            <tr className="text-left">
              <th className="px-4 py-3 font-mono text-xs text-slate">Zona</th>
              <th className="px-4 py-3 font-mono text-xs text-slate">Automática (ppm)</th>
              <th className="px-4 py-3 font-mono text-xs text-slate">Mínimo manual</th>
              <th className="px-4 py-3 font-mono text-xs text-slate">Máximo manual</th>
              <th className="px-4 py-3 font-mono text-xs text-slate">Se usa</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-mist">
            {HR_ZONES.map((z, i) => {
              const a = auto[i]
              const isManual = !!zones[z.code]
              return (
                <tr key={z.code} className="align-top">
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span className="inline-block w-8 text-center font-mono text-xs font-bold bg-primary text-white rounded-sm py-0.5 mr-2">{z.code}</span>
                    {z.name}
                  </td>
                  <td className="px-4 py-3 font-mono whitespace-nowrap text-slate">
                    {a.range ? `${a.range[0]} - ${a.range[1]}` : '—'}
                  </td>
                  <td className="px-4 py-3">
                    <input
                      type="number"
                      inputMode="numeric"
                      min={30}
                      max={250}
                      value={fields[z.code].lo}
                      onChange={(e) => setField(z.code, 'lo', e.target.value)}
                      aria-label={`${z.code} mínimo manual (ppm)`}
                      aria-invalid={!!errors[z.code]}
                      className={inputCls}
                    />
                  </td>
                  <td className="px-4 py-3">
                    <input
                      type="number"
                      inputMode="numeric"
                      min={30}
                      max={250}
                      value={fields[z.code].hi}
                      onChange={(e) => setField(z.code, 'hi', e.target.value)}
                      aria-label={`${z.code} máximo manual (ppm)`}
                      aria-invalid={!!errors[z.code]}
                      className={inputCls}
                    />
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    {errors[z.code] ? (
                      <span className="text-xs text-red max-w-[220px] inline-block whitespace-normal">{errors[z.code]}</span>
                    ) : isManual ? (
                      <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-mono font-semibold bg-red/15 text-red-deep">Manual</span>
                    ) : (
                      <span className="text-xs text-slate">Automática</span>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <div className="px-5 py-4 border-t border-mist space-y-3">
        {warnings.length > 0 && (
          <ul className="text-xs text-slate space-y-0.5">
            {warnings.map((w) => (
              <li key={w}>Aviso: {w}</li>
            ))}
          </ul>
        )}
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || hasErrors}
            className="px-5 py-2.5 bg-brand hover:bg-brand-deep text-white text-sm font-semibold rounded-sm disabled:opacity-60"
          >
            {saving ? 'Guardando…' : 'Guardar zonas manuales'}
          </button>
          <button
            type="button"
            onClick={() => {
              setFields(toFields({}))
              setMessage(null)
            }}
            className="px-4 py-2.5 text-sm text-slate border border-mist rounded-sm hover:border-red hover:text-red"
          >
            Vaciar todo (volver a automático)
          </button>
          {message && <span className={`text-sm ${message.ok ? 'text-navy' : 'text-red'}`}>{message.text}</span>}
        </div>
        <p className="text-xs text-slate">
          Deja el mínimo y el máximo vacíos en una zona para que siga calculándose sola. Tras vaciar, pulsa «Guardar» para aplicarlo.
        </p>
      </div>
    </div>
  )
}
