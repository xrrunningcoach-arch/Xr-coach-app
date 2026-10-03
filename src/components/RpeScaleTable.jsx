import { RPE_SCALE } from '../lib/rpeScale'

// "ESCALA DE INTENSIDAD (RPE - PERCEPCIÓN DE ESFUERZO)" del Excel.
export default function RpeScaleTable() {
  return (
    <div className="bg-white border border-mist rounded-sm overflow-hidden">
      <div className="px-5 py-3 bg-bg-dim">
        <h3 className="font-display text-lg text-navy">Escala de intensidad (RPE)</h3>
        <p className="font-mono text-[11px] text-slate">Percepción de esfuerzo</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[480px]">
          <thead>
            <tr className="text-left">
              <th className="px-4 py-3 font-mono text-xs text-slate">Escala RPE</th>
              <th className="px-4 py-3 font-mono text-xs text-slate">Intensidad</th>
              <th className="px-4 py-3 font-mono text-xs text-slate">Aplicación práctica en el plan</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-mist">
            {RPE_SCALE.map((r) => (
              <tr key={r.rpe}>
                <td className="px-4 py-3 font-mono whitespace-nowrap">{r.rpe}</td>
                <td className="px-4 py-3 whitespace-nowrap">{r.intensity}</td>
                <td className="px-4 py-3 text-slate">{r.use}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
