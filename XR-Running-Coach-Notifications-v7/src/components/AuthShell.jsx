import BrandMark from './BrandMark'
import { LangSwitch, ThemeToggle } from './ThemeLangControls'
import { useT } from '../i18n'

// Marco de las pantallas de acceso (login / registro).
export default function AuthShell({ children }) {
  const t = useT()
  return (
    <div className="min-h-dvh bg-navy-deep flex flex-col">
      <div className="flex justify-end items-center gap-2 p-4">
        <LangSwitch />
        <ThemeToggle />
      </div>
      <div className="flex-1 flex items-center justify-center px-4 pb-10">
        <div className="w-full max-w-sm xr-rise">
          <div className="mb-6 flex flex-col items-center text-center gap-3">
            <BrandMark size="lg" />
            <p className="text-sm text-white/70">{t('auth.tagline')}</p>
          </div>
          <div className="bg-surface border border-mist rounded-2xl shadow-2xl shadow-black/30 p-6 sm:p-8">{children}</div>
        </div>
      </div>
    </div>
  )
}
