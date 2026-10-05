import { Link, NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'

const navCls = ({ isActive }) =>
  `px-3 py-1.5 text-sm rounded-sm transition-colors ${
    isActive ? 'bg-bg-dim text-navy font-semibold' : 'text-slate hover:text-navy'
  }`

// wide = true: contenedor más ancho (vista del atleta con panel lateral y
// Biblioteca del entrenador). Por defecto se mantiene el ancho de siempre.
export default function Layout({ children, wide = false }) {
  const { profile, signOut } = useAuth()
  const navigate = useNavigate()

  const isCoach = profile?.role === 'coach'
  const home = isCoach ? '/coach' : '/atleta'
  const container = wide ? 'max-w-[1400px]' : 'max-w-6xl'

  async function handleSignOut() {
    await signOut()
    navigate('/login')
  }

  return (
    <div className="min-h-screen bg-bg text-ink">
      <header className="sticky top-0 z-40 bg-bg/95 backdrop-blur border-b border-mist">
        <div className={`${container} mx-auto px-5 sm:px-8 h-16 flex items-center justify-between gap-4`}>
          <div className="flex items-center gap-4 min-w-0">
            <Link to={home} className="font-display font-bold text-lg text-navy tracking-tight whitespace-nowrap">
              XR <span className="text-ink">/</span> Coach Panel
            </Link>
            {isCoach && (
              <nav aria-label="Entrenador" className="flex items-center gap-1">
                <NavLink to="/coach" end className={navCls}>Atletas</NavLink>
                <NavLink to="/coach/biblioteca" className={navCls}>Biblioteca</NavLink>
              </nav>
            )}
          </div>
          {profile && (
            <div className="flex items-center gap-4 text-sm">
              <span className="hidden sm:block text-slate">
                {profile.full_name || profile.email}
                <span className="ml-2 font-mono text-[11px] uppercase text-navy-light">
                  {isCoach ? 'Entrenador' : 'Atleta'}
                </span>
              </span>
              <button
                onClick={handleSignOut}
                className="px-3 py-1.5 border border-mist rounded-sm text-slate hover:border-red hover:text-red transition-colors"
              >
                Salir
              </button>
            </div>
          )}
        </div>
      </header>
      <main className={`${container} mx-auto px-5 sm:px-8 py-10`}>{children}</main>
    </div>
  )
}
