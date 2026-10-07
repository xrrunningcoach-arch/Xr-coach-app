import { Link, NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'
import { useT } from '../i18n'
import BrandMark from './BrandMark'
import { LangSwitch, ThemeToggle } from './ThemeLangControls'

const navCls = ({ isActive }) =>
  `px-3 py-1.5 text-sm rounded-md transition-colors ${
    isActive ? 'bg-bg-dim text-navy font-semibold' : 'text-slate hover:text-navy'
  }`

// wide = true: contenedor más ancho (vista del atleta con panel lateral y
// Biblioteca del entrenador). En móvil, el atleta tiene barra inferior, por eso
// el contenido deja hueco abajo (pb-28).
export default function Layout({ children, wide = false }) {
  const { profile, signOut } = useAuth()
  const navigate = useNavigate()
  const t = useT()

  const isCoach = profile?.role === 'coach'
  const home = isCoach ? '/coach' : '/atleta'
  const container = wide ? 'max-w-[1400px]' : 'max-w-6xl'

  async function handleSignOut() {
    await signOut()
    navigate('/login')
  }

  return (
    <div className="min-h-dvh bg-bg text-ink">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[90] focus:bg-surface focus:text-navy focus:px-3 focus:py-2 focus:rounded-md">
        {t('common.skip')}
      </a>
      <header className="sticky top-0 z-40 bg-bg/90 backdrop-blur border-b border-mist">
        <div className={`${container} mx-auto px-4 sm:px-8 h-16 flex items-center justify-between gap-3`}>
          <div className="flex items-center gap-4 min-w-0">
            <Link to={home} aria-label="XR Running Coach">
              <BrandMark showName={false} />
              <span className="hidden sm:inline ml-3 font-display font-bold text-lg text-navy align-middle">Running Coach</span>
            </Link>
            {isCoach && (
              <nav aria-label={t('nav.coachSections')} className="hidden sm:flex items-center gap-1">
                <NavLink to="/coach" end className={navCls}>{t('nav.athletes')}</NavLink>
                <NavLink to="/coach/biblioteca" className={navCls}>{t('nav.library')}</NavLink>
              </nav>
            )}
          </div>
          <div className="flex items-center gap-2 text-sm">
            <LangSwitch />
            <ThemeToggle />
            {profile && (
              <>
                <span className="hidden lg:block text-slate ml-2">
                  {profile.full_name || profile.email}
                  <span className="ml-2 font-mono text-[11px] uppercase text-navy-light">
                    {isCoach ? t('role.coach') : t('role.athlete')}
                  </span>
                </span>
                <button
                  onClick={handleSignOut}
                  className="px-3 py-1.5 border border-mist rounded-md text-slate hover:border-red hover:text-red transition-colors"
                >
                  {t('common.signOut')}
                </button>
              </>
            )}
          </div>
        </div>
        {isCoach && (
          <nav aria-label={t('nav.coachSections')} className={`sm:hidden ${container} mx-auto px-4 pb-2 flex items-center gap-1`}>
            <NavLink to="/coach" end className={navCls}>{t('nav.athletes')}</NavLink>
            <NavLink to="/coach/biblioteca" className={navCls}>{t('nav.library')}</NavLink>
          </nav>
        )}
      </header>
      <main id="main" className={`${container} mx-auto px-4 sm:px-8 pt-6 md:pt-10 pb-28 md:pb-12`}>{children}</main>
    </div>
  )
}
