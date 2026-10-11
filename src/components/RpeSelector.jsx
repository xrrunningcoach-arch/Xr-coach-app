import { useT } from '../i18n'

const RPE_GROUPS = [
  { from: 0, to: 3, key: 'log.easy' },
  { from: 4, to: 5, key: 'log.moderate' },
  { from: 6, to: 7, key: 'log.hard' },
  { from: 8, to: 9, key: 'log.veryHard' },
  { from: 10, to: 10, key: 'log.max' },
]
export const rpeWord = (n) => RPE_GROUPS.find((g) => n >= g.from && n <= g.to).key

// Selector de esfuerzo 0-10 (botones grandes, pensado para el móvil).
// value: '' (sin elegir) o número/cadena · onChange(n | '')
export default function RpeSelector({ value, onChange }) {
  const t = useT()
  const current = value === '' || value == null ? '' : String(value)
  return (
    <div>
      <p className="font-mono text-[11px] uppercase text-navy-light mb-2">{t('log.rpe')}</p>
      <div className="grid grid-cols-6 sm:grid-cols-11 gap-1.5 sm:gap-1" role="radiogroup" aria-label={t('log.rpe')}>
        {Array.from({ length: 11 }, (_, n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={current === String(n)}
            onClick={() => onChange(current === String(n) ? '' : n)}
            className={`h-11 rounded-md text-sm font-mono font-semibold border transition-colors ${
              current === String(n)
                ? 'bg-brand border-brand text-white'
                : 'bg-surface border-mist text-ink hover:border-navy-light'
            }`}
          >
            {n}
          </button>
        ))}
      </div>
      <p className="mt-1.5 h-4 text-xs text-slate">{current !== '' ? t(rpeWord(Number(current))) : ''}</p>
    </div>
  )
}
