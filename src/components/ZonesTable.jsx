import { resolveZones } from '../lib/zones'
import { useT } from '../i18n'

// Tabla "ZONAS DE ENTRENAMIENTO (% FC MÁXIMA)" del Excel. Se recalcula sola
// a partir de la FC máxima que reciba por props. Si el entrenador ha fijado
// zonas a mano (manualZones), esas zonas TIENEN PRIORIDAD sobre el cálculo
// automático y se marcan como «Manual».
export default function ZonesTable({ maxHr, sourceLabel, manualZones, testZones }) {
  const t = useT()
  const zones = resolveZones({ maxHr, manualZones, testZones })
  const manualCount = zones.filter((z) => z.source === 'manual').length
  const testCount = zones.filter((z) => z.source === 'test').length
  return (
    <div className="bg-surface border border-mist rounded-sm overflow-hidden">
      <div className="px-5 py-3 bg-bg-dim flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-display text-lg text-navy">{t('zones.title')}</h3>
        <span className="font-mono text-[11px] text-slate">
          {maxHr ? `${t('zones.maxHr', { hr: maxHr })}${sourceLabel ? ` · ${['real', 'estimada'].includes(sourceLabel) ? t('zones.src.' + sourceLabel) : sourceLabel}` : ''}` : manualCount ? t('zones.manualByCoach') : t('zones.missing')}
          {testCount > 0 ? ` · ${t('zones.testBased')}` : ''}
          {manualCount > 0 && maxHr ? ` · ${t('zones.manualCount', { count: manualCount })}` : ''}
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[680px]">
          <thead>
            <tr className="text-left">
              <th className="px-4 py-3 font-mono text-xs text-slate">{t('zones.col.zone')}</th>
              <th className="px-4 py-3 font-mono text-xs text-slate">{t('zones.col.pct')}</th>
              <th className="px-4 py-3 font-mono text-xs text-slate">{t('zones.col.target')}</th>
              <th className="px-4 py-3 font-mono text-xs text-slate">{t('zones.col.rpe')}</th>
              <th className="px-4 py-3 font-mono text-xs text-slate">{t('zones.col.use')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-mist">
            {zones.map((z) => (
              <tr key={z.code}>
                <td className="px-4 py-3 whitespace-nowrap">
                  <span className="inline-block w-8 text-center font-mono text-xs font-bold bg-primary text-white rounded-sm py-0.5 mr-2">
                    {z.code}
                  </span>
                  {z.code === 'Z4' && z.source !== 'auto' ? t('zone.Z4.nameTest') : t(`zone.${z.code}.name`)}
                  {z.source === 'test' && (
                    <span className="ml-2 inline-block px-2 py-0.5 rounded-full text-[10px] font-mono font-semibold bg-brand/15 text-navy">
                      {t('zones.test')}
                    </span>
                  )}
                  {z.source === 'manual' && (
                    <span className="ml-2 inline-block px-2 py-0.5 rounded-full text-[10px] font-mono font-semibold bg-red/15 text-red-deep">
                      {t('zones.manual')}
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 font-mono whitespace-nowrap">{z.pctLabel}</td>
                <td className="px-4 py-3 font-mono whitespace-nowrap">
                  {z.range ? `${z.range[0]} - ${z.range[1]} ppm` : '—'}
                </td>
                <td className="px-4 py-3 font-mono whitespace-nowrap">{z.rpe}</td>
                <td className="px-4 py-3 text-slate">{t(`zone.${z.code}.use`)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
