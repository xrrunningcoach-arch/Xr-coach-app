import { LANGS, useLang, useT } from '../i18n'
import { useTheme } from '../ui/theme'
import { IconMoon, IconSun } from './icons'

export function LangSwitch() {
  const { lang, setLang } = useLang()
  const t = useT()
  return (
    <div role="group" aria-label={t('common.language')} className="inline-flex rounded-md border border-mist overflow-hidden">
      {LANGS.map((l) => (
        <button
          key={l.code}
          type="button"
          onClick={() => setLang(l.code)}
          aria-pressed={lang === l.code}
          title={l.label}
          className={`px-2.5 py-1.5 font-mono text-[11px] font-semibold transition-colors ${
            lang === l.code ? 'bg-primary text-white' : 'text-slate hover:text-navy'
          }`}
        >
          {l.short}
        </button>
      ))}
    </div>
  )
}

export function ThemeToggle() {
  const { theme, toggle } = useTheme()
  const t = useT()
  const label = theme === 'dark' ? t('common.themeToLight') : t('common.themeToDark')
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={label}
      title={label}
      className="w-9 h-9 inline-flex items-center justify-center rounded-md border border-mist text-slate hover:text-navy hover:border-navy-light transition-colors"
    >
      {theme === 'dark' ? <IconSun width={18} height={18} /> : <IconMoon width={18} height={18} />}
    </button>
  )
}
