import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../supabaseClient'
import { useT } from '../i18n'
import { HR_ZONES, formatPaceSec, manualZoneWarnings, parseManualForm } from '../lib/zones'

const inputCls = 'w-24 border border-mist rounded-sm px-2 py-1.5 text-sm font-mono bg-surface focus:outline-none focus:border-navy'

function toFields(manualZones) {
  const out = {}
  HR_ZONES.forEach((z) => {
    const m = manualZones?.[z.code]
    out[z.code] = {
      lo: m?.lo ?? '',
      hi: m?.hi ?? '',
      pace_from: m?.pace_from ? formatPaceSec(m.pace_from) : '',
      pace_to: m?.pace_to ? formatPaceSec(m.pace_to) : '',
    }
  })
  return out
}

// Panel del entrenador para escribir las zonas de UN atleta (pulso y ritmo), desde
// su criterio. No hay zonas automáticas: una zona vacía queda sin definir.
export default function HrZonesManual({ athleteId, coachId, manualZones, onPreview, onSaved }) {
  const t = useT()
  const [fields, setFields] = useState(() => toFields(manualZones))
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState(null)

  const { zones, errors } = useMemo(() => parseManualForm(fields), [fields])
  const warnings = useMemo(() => manualZoneWarnings(zones), [zones])

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
    setMessage({ ok: true, text: Object.keys(zones).length ? t('zones.saved') : t('zones.removed') })
    onSaved?.()
  }

  const bpm = t('unit.bpm')
  const num = (code, key, label, extra = {}) => (
    <input
      type="number"
      inputMode="numeric"
      min={30}
      max={250}
      value={fields[code][key]}
      onChange={(e) => setField(code, key, e.target.value)}
      aria-label={`${code} ${label}`}
      aria-invalid={!!errors[code]}
      className={inputCls}
      {...extra}
    />
  )
  const pace = (code, key, label) => (
    <input
      type="text"
      inputMode="numeric"
      placeholder="m:ss"
      maxLength={5}
      value={fields[code][key]}
      onChange={(e) => setField(code, key, e.target.value)}
      aria-label={`${code} ${label}`}
      aria-invalid={!!errors[code]}
      className={inputCls}
    />
  )

  return (
    <div className="bg-surface border border-mist rounded-sm overflow-hidden">
      <div className="px-5 py-3 bg-bg-dim">
        <h3 className="font-display text-lg text-navy">{t('zones.manualTitle')}</h3>
        <p className="font-mono text-[11px] text-slate">{t('zones.manualSub')}</p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[720px]">
          <thead>
            <tr className="text-left">
              <th className="px-4 py-3 font-mono text-xs text-slate">{t('zones.col.zone')}</th>
              <th className="px-4 py-3 font-mono text-xs text-slate">{t('zones.col.min', { unit: bpm })}</th>
              <th className="px-4 py-3 font-mono text-xs text-slate">{t('zones.col.max', { unit: bpm })}</th>
              <th className="px-4 py-3 font-mono text-xs text-slate">{t('zones.col.paceFrom')}</th>
              <th className="px-4 py-3 font-mono text-xs text-slate">{t('zones.col.paceTo')}</th>
              <th className="px-4 py-3 font-mono text-xs text-slate">{t('zones.col.status')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-mist">
            {HR_ZONES.map((z) => {
              const isManual = !!zones[z.code]
              const err = errors[z.code]
              return (
                <tr key={z.code} className="align-top">
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span className="inline-block w-8 text-center font-mono text-xs font-bold bg-primary text-white rounded-sm py-0.5 mr-2">{z.code}</span>
                    {t(`zone.${z.code}.name`)}
                    <span className="block font-mono text-[11px] text-slate mt-0.5">{z.rpe}</span>
                  </td>
                  <td className="px-4 py-3">{num(z.code, 'lo', t('zones.col.min', { unit: bpm }))}</td>
                  <td className="px-4 py-3">{num(z.code, 'hi', t('zones.col.max', { unit: bpm }))}</td>
                  <td className="px-4 py-3">{pace(z.code, 'pace_from', t('zones.col.paceFrom'))}</td>
                  <td className="px-4 py-3">{pace(z.code, 'pace_to', t('zones.col.paceTo'))}</td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    {err ? (
                      <span className="text-xs text-red max-w-[220px] inline-block whitespace-normal">{t(err.key, err.params)}</span>
                    ) : isManual ? (
                      <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-mono font-semibold bg-red/15 text-red-deep">{t('zones.manual')}</span>
                    ) : (
                      <span className="text-xs text-slate">{t('zones.undef')}</span>
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
              <li key={w.key + JSON.stringify(w.params)}>{t('zones.warnPrefix', { msg: t(w.key, w.params) })}</li>
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
            {saving ? t('common.saving') : t('zones.save')}
          </button>
          <button
            type="button"
            onClick={() => {
              setFields(toFields({}))
              setMessage(null)
            }}
            className="px-4 py-2.5 text-sm text-slate border border-mist rounded-sm hover:border-red hover:text-red"
          >
            {t('zones.clear')}
          </button>
          {message && <span className={`text-sm ${message.ok ? 'text-navy' : 'text-red'}`}>{message.text}</span>}
        </div>
        <p className="text-xs text-slate">{t('zones.manualHelp')}</p>
      </div>
    </div>
  )
}
