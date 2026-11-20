import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'
import { useT } from '../i18n'
import { ui } from '../ui/ui'
import BrandMark from './BrandMark'
import { LangSwitch, ThemeToggle } from './ThemeLangControls'
import PushNotificationSettings from './PushNotificationSettings'
import Sidebar from './Sidebar'
import { IconClose, IconLibrary, IconUser, IconUsers } from './icons'
import { IconMapPin } from './icons-social'
import { removeCurrentDevicePushSubscription } from '../lib/pushSubscriptions'

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
  const [accountOpen, setAccountOpen] = useState(false)

  const isCoach = profile?.role === 'coach'
  const home = isCoach ? '/coach' : '/atleta'
  const container = wide ? 'max-w-[1400px]' : 'max-w-6xl'

  const coachGroups = [
    {
      title: t('nav.coachSections'),
      items: [
        { id: '/coach', label: t('nav.athletes'), icon: IconUsers, primary: true },
        { id: '/coach/biblioteca', label: t('nav.library'), icon: IconLibrary, primary: true },
        { id: '/coach/quedadas', label: t('nav.meetups'), icon: IconMapPin, primary: true },
      ],
    },
  ]
  const coachActive = pathname.startsWith('/coach/biblioteca')
    ? '/coach/biblioteca'
    : pathname.startsWith('/coach/quedadas')
      ? '/coach/quedadas'
      : '/coach'

  useEffect(() => {
    const openAccount = () => setAccountOpen(true)
    window.addEventListener('xr:open-account', openAccount)
    return () => window.removeEventListener('xr:open-account', openAccount)
  }, [])

  useEffect(() => {
    if (!accountOpen) return undefined
    const onKeyDown = (event) => { if (event.key === 'Escape') setAccountOpen(false) }
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [accountOpen])

  async function handleSignOut() {
    try {
      // Limpia el dispositivo antes de cerrar sesión. Un fallo de red no debe
      // impedir salir, y el service worker se desuscribe igualmente.
      try { await removeCurrentDevicePushSubscription(profile?.id) } catch (pushError) {
        console.info('No se pudo limpiar la suscripción push del dispositivo:', pushError.message)
      }
      const { error } = await signOut()
      if (error) throw error
      setAccountOpen(false)
      navigate('/login', { replace: true })
    } catch (error) {
      ui.error(error.message || t('common.error'))
    }
  }

  function openAthleteProfile() {
    setAccountOpen(false)
    window.dispatchEvent(new Event('xr:open-athlete-profile'))
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
          <div className="hidden md:flex items-center gap-2 text-sm">
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
                  type="button"
                  onClick={handleSignOut}
                  className="min-h-11 shrink-0 px-3 py-1.5 border border-mist rounded-md text-slate hover:border-red hover:text-red transition-colors"
                >
                  {t('common.signOut')}
                </button>
              </>
            )}
          </div>
          {profile && pathname !== '/atleta' && pathname !== '/coach' && <button type="button" onClick={() => setAccountOpen(true)} aria-label={t('mobile.openAccount')} aria-haspopup="dialog" aria-expanded={accountOpen} className="md:hidden grid h-11 w-11 shrink-0 place-items-center rounded-lg border border-mist bg-surface text-navy hover:border-brand">
            <IconUser width={21} height={21} />
          </button>}
        </div>
      </header>
      {accountOpen && profile && <div className="md:hidden fixed inset-0 z-[70] flex items-end bg-black/55" onMouseDown={(event) => { if (event.target === event.currentTarget) setAccountOpen(false) }}>
        <section role="dialog" aria-modal="true" aria-label={t('mobile.account')} className="xr-rise w-full max-h-[88dvh] overflow-y-auto rounded-t-2xl border-t border-mist bg-surface p-5 pb-safe">
          <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-mist" />
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="font-mono text-[10px] uppercase tracking-widest text-navy-light">{t('mobile.account')}</p>
              <h2 className="mt-1 truncate font-display text-2xl text-navy">{profile.full_name || profile.email}</h2>
              <p className="mt-0.5 text-xs text-slate">{isCoach ? t('role.coach') : t('role.athlete')}</p>
            </div>
            <button type="button" onClick={() => setAccountOpen(false)} aria-label={t('common.close')} className="grid h-11 w-11 shrink-0 place-items-center rounded-lg border border-mist text-slate hover:text-navy"><IconClose width={20} height={20} /></button>
          </div>

          <div className="mt-5 grid grid-cols-2 gap-3">
            <div className="flex min-h-20 flex-col items-start justify-center gap-1 rounded-lg border border-mist bg-bg-dim px-3 py-2">
              <span className="font-mono text-[10px] uppercase text-slate">{t('common.language')}</span><LangSwitch />
            </div>
            <div className="flex min-h-20 flex-col items-start justify-center gap-1 rounded-lg border border-mist bg-bg-dim px-3 py-2">
              <span className="font-mono text-[10px] uppercase text-slate">{t('mobile.appearance')}</span><ThemeToggle />
            </div>
          </div>

          {!isCoach && <button type="button" onClick={openAthleteProfile} className="mt-3 flex min-h-12 w-full items-center gap-3 rounded-lg border border-mist px-4 text-left text-sm font-semibold text-navy hover:border-brand hover:bg-bg-dim">
            <IconUser width={19} height={19} />{t('nav.profile')}<span className="ml-auto text-slate">→</span>
          </button>}

          <div className="mt-4"><PushNotificationSettings userId={profile.id} /></div>

          <button type="button" onClick={handleSignOut} className="mt-4 flex min-h-12 w-full items-center justify-center rounded-lg border border-red/40 px-4 text-sm font-bold text-red hover:bg-red/10">
            {t('common.signOut')}
          </button>
        </section>
      </div>}
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
