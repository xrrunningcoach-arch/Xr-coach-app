import { formatPaceSec, resolveZones } from '../lib/zones'
import { useT } from '../i18n'

const paceLabel = (pace) => (pace ? `${formatPaceSec(pace[0])} – ${formatPaceSec(pace[1])} /km` : '—')

// Tabla única de zonas y umbrales de un atleta: zona, RPE (0-10), pulso, ritmo y
// aplicación. Muestra solo lo que ha escrito el entrenador; no calcula nada.
// Si recibe el último test de umbrales (`test`), añade VT1, VT2, vAM y lactato.
export default function ZonesTable({ maxHr, manualZones, test = null }) {
  const t = useT()
  const zones = resolveZones({ maxHr, manualZones })
  const defined = zones.filter((z) => z.source === 'manual').length
  const bpm = t('unit.bpm')
  const thr = (hr, pace) => (hr ? `${hr} ${bpm}${pace ? ` · ${formatPaceSec(pace)} /km` : ''}` : '—')

  return (
    <div className="bg-surface border border-mist rounded-sm overflow-hidden">
      <div className="px-5 py-3 bg-bg-dim flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-display text-lg text-navy">{t('zones.title')}</h3>
        <span className="font-mono text-[11px] text-slate">
          {maxHr ? t('zones.maxHr', { hr: maxHr }) : defined ? t('zones.manualByCoach') : t('zones.missing')}
          {defined > 0 && maxHr ? ` · ${t('zones.manualCount', { count: defined })}` : ''}
        </span>
      </div>
      <p className="px-5 pt-4 text-sm text-slate">{t('zones.rpeIntro')}</p>
      <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[720px]">
          <thead>
            <tr className="text-left">
              <th className="px-4 py-3 font-mono text-xs text-slate">{t('zones.col.zone')}</th>
              <th className="px-4 py-3 font-mono text-xs text-slate">{t('zones.col.rpe')}</th>
              <th className="px-4 py-3 font-mono text-xs text-slate">{t('zones.col.target')}</th>
              <th className="px-4 py-3 font-mono text-xs text-slate">{t('zones.col.pace')}</th>
              <th className="px-4 py-3 font-mono text-xs text-slate">{t('zones.col.pct')}</th>
              <th className="px-4 py-3 font-mono text-xs text-slate">{t('zones.col.use')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-mist">
            {zones.map((z) => (
              <tr key={z.code}>
                <td className="px-4 py-3 whitespace-nowrap">
                  <span className="inline-block w-8 text-center font-mono text-xs font-bold bg-primary text-white rounded-sm py-0.5 mr-2">{z.code}</span>
                  {t(`zone.${z.code}.name`)}
                </td>
                <td className="px-4 py-3 font-mono whitespace-nowrap">{z.rpe}</td>
                <td className="px-4 py-3 font-mono whitespace-nowrap">{z.range ? `${z.range[0]} - ${z.range[1]} ${bpm}` : '—'}</td>
                <td className="px-4 py-3 font-mono whitespace-nowrap">{paceLabel(z.pace)}</td>
                <td className="px-4 py-3 font-mono whitespace-nowrap">{z.pctLabel}</td>
                <td className="px-4 py-3 text-slate">{t(`zone.${z.code}.use`)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {test && (
        <div className="border-t border-mist px-5 py-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2 mb-3">
            <h4 className="font-display text-base text-navy">{t('zones.thresholds')}</h4>
            <span className="font-mono text-[11px] text-slate">{t('thr.dated', { date: test.test_date, type: t('thr.type.' + test.test_type) })}</span>
          </div>
          <dl className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              ['VT1', thr(test.vt1_hr, test.vt1_pace_s_km)],
              ['VT2', thr(test.vt2_hr, test.vt2_pace_s_km)],
              ['vAM', test.vam_kmh ? `${test.vam_kmh} km/h` : '—'],
              [t('thr.lactate'), test.lactate_threshold_mmol ? `${test.lactate_threshold_mmol} mmol/l` : '—'],
            ].map(([label, value]) => (
              <div key={label}>
                <dt className="font-mono text-[11px] text-navy-light uppercase">{label}</dt>
                <dd className="text-sm font-semibold mt-0.5">{value}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}
    </div>
  )
}
