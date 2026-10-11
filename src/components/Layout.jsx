import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'
import { useT } from '../i18n'
import BrandMark from './BrandMark'
import { LangSwitch, ThemeToggle } from './ThemeLangControls'
import Sidebar from './Sidebar'
import { IconLibrary, IconUsers } from './icons'

// wide = true: contenedor más ancho (vista del atleta con panel lateral y
// Biblioteca del entrenador). En móvil, atletas y entrenadores tienen barra
// inferior (la del entrenador se genera aquí), por eso el contenido deja hueco
// abajo (pb-28). En escritorio, el entrenador tiene el mismo panel lateral
// desplegable que el atleta.
export default function Layout({ children, wide = false }) {
  const { profile, signOut } = useAuth()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const t = useT()

  const isCoach = profile?.role === 'coach'
  const home = isCoach ? '/coach' : '/atleta'
  const container = wide ? 'max-w-[1400px]' : 'max-w-6xl'

  const coachGroups = [
    {
      title: t('nav.coachSections'),
      items: [
        { id: '/coach', label: t('nav.athletes'), icon: IconUsers, primary: true },
        { id: '/coach/biblioteca', label: t('nav.library'), icon: IconLibrary, primary: true },
      ],
    },
  ]
  const coachActive = pathname.startsWith('/coach/biblioteca') ? '/coach/biblioteca' : '/coach'

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
      </header>
      {isCoach ? (
        <div className={`${container} mx-auto px-4 sm:px-8 pt-6 md:pt-10 pb-28 md:pb-12 md:flex md:gap-6`}>
          <Sidebar groups={coachGroups} active={coachActive} onSelect={(path) => navigate(path)} ariaLabel={t('nav.coachSections')} />
          <main id="main" className="flex-1 min-w-0">{children}</main>
        </div>
      ) : (
        <main id="main" className={`${container} mx-auto px-4 sm:px-8 pt-6 md:pt-10 pb-28 md:pb-12`}>{children}</main>
      )}
    </div>
  )
}
