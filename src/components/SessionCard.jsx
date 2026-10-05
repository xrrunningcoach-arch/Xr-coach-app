import { useState } from 'react'
import { supabase } from '../supabaseClient'
import StatusBadge from './StatusBadge'
import DisciplineFields from './DisciplineFields'

// Tarjeta de actividad del atleta. Movida SIN CAMBIOS desde AthleteDashboard.jsx
// (mismo HTML y mismas clases CSS) para poder renderizarla dentro del
// calendario. Si tocas esta tarjeta, tócala aquí: la usan Semana, Mes y Día.
export default function SessionRow({ session, discipline, evaluations, onUpdated }) {
  const [open, setOpen] = useState(false)
  const [status, setStatus] = useState(session.status)
  const [rpeActual, setRpeActual] = useState(session.rpe_actual || '')
  const [rpeValue, setRpeValue] = useState(session.rpe_actual_value ?? '')
  const [durationActual, setDurationActual] = useState(session.duration_actual_min ?? '')
  const [notes, setNotes] = useState(session.athlete_notes || '')
  const [link, setLink] = useState(session.link_url || '')
  const [metrics, setMetrics] = useState({})
  const [saving, setSaving] = useState(false)

  async function handleSave() {
    setSaving(true)
    const { error } = await supabase.rpc('submit_session', {
      p_session_id: session.id,
      p_status: status,
      p_rpe_actual: rpeActual,
      p_notes: notes,
      p_link_url: link,
      p_duration_actual_min: durationActual === '' ? null : Number(durationActual),
      p_rpe_actual_value: rpeValue === '' ? null : Number(rpeValue),
      p_metrics: metrics,
    })
    setSaving(false)
    if (error) {
      alert('Error al guardar: ' + error.message)
      return
    }
    setOpen(false)
    onUpdated()
  }

  return (
    <div className="px-5 py-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex-1 min-w-[220px]">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span className="font-mono text-xs text-slate">Día {session.day_number}</span>
            {discipline && (
              <span className="font-mono text-[11px] uppercase text-navy-light border border-mist rounded-full px-2 py-0.5">
                {discipline.name}
              </span>
            )}
            <StatusBadge status={session.status} />
          </div>
          <p className="font-semibold text-sm">{session.session_type || 'Sesión'}</p>
          <p className="text-sm text-slate mt-0.5">{session.description || 'El entrenador aún no ha detallado esta sesión.'}</p>
          <p className="font-mono text-xs text-navy-light mt-1">
            {session.km_estimated ? `${session.km_estimated} km` : ''}
            {session.duration_planned_min ? ` · ${session.duration_planned_min} min previstos` : ''}
            {session.rpe_theoretical ? ` · ${session.rpe_theoretical} (teórico)` : ''}
          </p>
          {discipline && <DisciplineFields discipline={discipline} values={session.metrics} readOnly />}
        </div>
        <button
          onClick={() => setOpen((v) => !v)}
          className="px-3 py-1.5 text-sm border border-navy text-navy rounded-sm hover:bg-navy hover:text-white transition-colors"
        >
          {open ? 'Cerrar' : 'Registrar'}
        </button>
      </div>

      {evaluations.length > 0 && (
        <div className="mt-3 space-y-2">
          {evaluations.map((ev) => (
            <div key={ev.id} className="bg-bg-dim rounded-sm px-3 py-2">
              <span className="font-mono text-xs text-navy-light" aria-label={`Valoración: ${ev.rating} de 5`}>
                {'★'.repeat(ev.rating)}
                {'☆'.repeat(5 - ev.rating)}
              </span>
              {ev.comment && <p className="text-sm text-slate mt-0.5">{ev.comment}</p>}
            </div>
          ))}
        </div>
      )}

      {open && (
        <div className="mt-4 bg-bg-dim rounded-sm p-4 space-y-3">
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <label className="block font-mono text-xs text-slate mb-1">Estado</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className="w-full border border-mist rounded-sm px-3 py-2 bg-white"
              >
                <option value="pendiente">Pendiente</option>
                <option value="completado">Completado</option>
                <option value="saltado">Saltado</option>
              </select>
            </div>
            <div>
              <label className="block font-mono text-xs text-slate mb-1">RPE real (nota)</label>
              <input
                value={rpeActual}
                onChange={(e) => setRpeActual(e.target.value)}
                placeholder="Ej. RPE 6 fuerte"
                className="w-full border border-mist rounded-sm px-3 py-2 bg-white"
              />
            </div>
          </div>

          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <label className="block font-mono text-xs text-slate mb-1">Duración real (min)</label>
              <input
                type="number"
                min={0}
                max={720}
                value={durationActual}
                onChange={(e) => setDurationActual(e.target.value)}
                placeholder="Ej. 55"
                className="w-full border border-mist rounded-sm px-3 py-2 bg-white"
              />
            </div>
            <div>
              <label className="block font-mono text-xs text-slate mb-1">RPE (0-10, para la carga)</label>
              <select
                value={rpeValue}
                onChange={(e) => setRpeValue(e.target.value)}
                className="w-full border border-mist rounded-sm px-3 py-2 bg-white"
              >
                <option value="">Sin valorar</option>
                {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
            </div>
          </div>

          {discipline && (
            <div>
              <p className="font-mono text-xs text-slate mb-1">Datos de la sesión ({discipline.name})</p>
              <DisciplineFields discipline={discipline} values={metrics} onChange={setMetrics} />
            </div>
          )}

          <div>
            <label className="block font-mono text-xs text-slate mb-1">Notas / sensaciones</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              className="w-full border border-mist rounded-sm px-3 py-2 bg-white resize-none"
            />
          </div>
          <div>
            <label className="block font-mono text-xs text-slate mb-1">Enlace (Strava / Garmin / otro)</label>
            <input
              value={link}
              onChange={(e) => setLink(e.target.value)}
              placeholder="https://..."
              className="w-full border border-mist rounded-sm px-3 py-2 bg-white"
            />
          </div>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 bg-red hover:bg-red-deep text-white text-sm font-semibold rounded-sm disabled:opacity-60"
          >
            {saving ? 'Guardando…' : 'Guardar entrenamiento'}
          </button>
        </div>
      )}
    </div>
  )
}
