import { RPE_SCALE } from '../lib/rpeScale'
import { useT } from '../i18n'

// "ESCALA DE INTENSIDAD (RPE - PERCEPCIÓN DE ESFUERZO)" del Excel.
export default function RpeScaleTable() {
  const t = useT()
  return (
    <div className="bg-surface border border-mist rounded-xl overflow-hidden">
      <div className="px-5 py-3 bg-bg-dim">
        <h3 className="font-display text-lg text-navy">{t('rpe.title')}</h3>
        <p className="font-mono text-[11px] text-slate">{t('rpe.subtitle')}</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[480px]">
          <thead>
            <tr className="text-left">
              <th className="px-4 py-3 font-mono text-xs text-slate">{t('rpe.col.scale')}</th>
              <th className="px-4 py-3 font-mono text-xs text-slate">{t('rpe.col.intensity')}</th>
              <th className="px-4 py-3 font-mono text-xs text-slate">{t('rpe.col.use')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-mist">
            {RPE_SCALE.map((r, i) => (
              <tr key={r.rpe}>
                <td className="px-4 py-3 font-mono whitespace-nowrap">{r.rpe}</td>
                <td className="px-4 py-3 whitespace-nowrap">{t(`rpe.row.${i}.intensity`)}</td>
                <td className="px-4 py-3 text-slate">{t(`rpe.row.${i}.use`)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
