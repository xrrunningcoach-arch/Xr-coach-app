import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import { useT } from '../i18n'

// Ejercicios de fuerza de una sesión, en solo lectura para el atleta.
export default function ExerciseList({ sessionId }) {
  const t = useT()
  const [rows, setRows] = useState(null)

  useEffect(() => {
    let alive = true
    supabase
      .from('session_exercises')
      .select('*')
      .eq('session_id', sessionId)
      .order('order_index')
      .then(({ data, error }) => {
        if (alive) setRows(error ? [] : data || [])
      })
    return () => {
      alive = false
    }
  }, [sessionId])

  if (!rows || rows.length === 0) return null
  return (
    <div className="mt-2 overflow-x-auto">
      <table className="text-sm w-full max-w-md">
        <thead>
          <tr className="text-left font-mono text-[11px] text-slate">
            <th className="pr-3 py-1">{t('ex.name')}</th>
            <th className="pr-3 py-1">{t('ex.sets')}</th>
            <th className="pr-3 py-1">{t('ex.reps')}</th>
            <th className="pr-3 py-1">{t('ex.load')}</th>
            <th className="py-1">RPE</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-mist">
          {rows.map((r) => (
            <tr key={r.id}>
              <td className="pr-3 py-1 font-medium">{r.exercise_name}</td>
              <td className="pr-3 py-1 font-mono">{r.sets ?? '—'}</td>
              <td className="pr-3 py-1 font-mono">{r.reps ?? '—'}</td>
              <td className="pr-3 py-1 font-mono">{r.load_kg != null ? `${r.load_kg} kg` : '—'}</td>
              <td className="py-1 font-mono">{r.rpe_set || '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
