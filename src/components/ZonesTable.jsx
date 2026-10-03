import { HR_ZONES, zoneRange } from '../lib/zones'

// Tabla "ZONAS DE ENTRENAMIENTO (% FC MÁXIMA)" del Excel. Se recalcula sola
// a partir de la FC máxima que reciba por props.
export default function ZonesTable({ maxHr, sourceLabel }) {
  return (
    <div className="bg-white border border-mist rounded-sm overflow-hidden">
      <div className="px-5 py-3 bg-bg-dim flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-display text-lg text-navy">Zonas de entrenamiento (% FC máxima)</h3>
        <span className="font-mono text-[11px] text-slate">
          {maxHr ? `FC máx. ${maxHr} ppm${sourceLabel ? ` · ${sourceLabel}` : ''}` : 'Falta la edad o la FC máxima'}
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
            {HR_ZONES.map((z) => {
              const range = zoneRange(maxHr, z)
              return (
                <tr key={z.code}>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span className="inline-block w-8 text-center font-mono text-xs font-bold bg-navy text-white rounded-sm py-0.5 mr-2">
                      {z.code}
                    </span>
                    {z.name}
                  </td>
                  <td className="px-4 py-3 font-mono whitespace-nowrap">
                    {Math.round(z.lo * 100)}% - {Math.round(z.hi * 100)}%
                  </td>
                  <td className="px-4 py-3 font-mono whitespace-nowrap">
                    {range ? `${range[0]} - ${range[1]} ppm` : '—'}
                  </td>
                  <td className="px-4 py-3 font-mono whitespace-nowrap">{z.rpe}</td>
                  <td className="px-4 py-3 text-slate">{z.use}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
