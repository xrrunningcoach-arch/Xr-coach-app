import { resolveZones } from '../lib/zones'

// Tabla "ZONAS DE ENTRENAMIENTO (% FC MÁXIMA)" del Excel. Se recalcula sola
// a partir de la FC máxima que reciba por props. Si el entrenador ha fijado
// zonas a mano (manualZones), esas zonas TIENEN PRIORIDAD sobre el cálculo
// automático y se marcan como «Manual».
export default function ZonesTable({ maxHr, sourceLabel, manualZones }) {
  const zones = resolveZones({ maxHr, manualZones })
  const manualCount = zones.filter((z) => z.source === 'manual').length
  return (
    <div className="bg-white border border-mist rounded-sm overflow-hidden">
      <div className="px-5 py-3 bg-bg-dim flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-display text-lg text-navy">Zonas de entrenamiento (% FC máxima)</h3>
        <span className="font-mono text-[11px] text-slate">
          {maxHr ? `FC máx. ${maxHr} ppm${sourceLabel ? ` · ${sourceLabel}` : ''}` : manualCount ? 'Zonas fijadas por tu entrenador' : 'Falta la edad o la FC máxima'}
          {manualCount > 0 && maxHr ? ` · ${manualCount} ${manualCount === 1 ? 'zona manual' : 'zonas manuales'}` : ''}
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[680px]">
          <thead>
            <tr className="text-left">
              <th className="px-4 py-3 font-mono text-xs text-slate">Zona</th>
              <th className="px-4 py-3 font-mono text-xs text-slate">% FC máx</th>
              <th className="px-4 py-3 font-mono text-xs text-slate">FC objetivo (ppm)</th>
              <th className="px-4 py-3 font-mono text-xs text-slate">Equivalencia RPE</th>
              <th className="px-4 py-3 font-mono text-xs text-slate">Aplicación en el plan</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-mist">
            {zones.map((z) => (
              <tr key={z.code}>
                <td className="px-4 py-3 whitespace-nowrap">
                  <span className="inline-block w-8 text-center font-mono text-xs font-bold bg-navy text-white rounded-sm py-0.5 mr-2">
                    {z.code}
                  </span>
                  {z.name}
                  {z.source === 'manual' && (
                    <span className="ml-2 inline-block px-2 py-0.5 rounded-full text-[10px] font-mono font-semibold bg-red/15 text-red-deep">
                      Manual
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 font-mono whitespace-nowrap">{z.pctLabel}</td>
                <td className="px-4 py-3 font-mono whitespace-nowrap">
                  {z.range ? `${z.range[0]} - ${z.range[1]} ppm` : '—'}
                </td>
                <td className="px-4 py-3 font-mono whitespace-nowrap">{z.rpe}</td>
                <td className="px-4 py-3 text-slate">{z.use}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
