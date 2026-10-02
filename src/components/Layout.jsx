import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'

export default function Layout({ children }) {
  const { profile, signOut } = useAuth()
  const navigate = useNavigate()

  const home = profile?.role === 'coach' ? '/coach' : '/atleta'

  async function handleSignOut() {
    await signOut()
    navigate('/login')
  }

  return (
    <div className="min-h-screen bg-bg text-ink">
      <header className="sticky top-0 z-40 bg-bg/95 backdrop-blur border-b border-mist">
        <div className="max-w-6xl mx-auto px-5 sm:px-8 h-16 flex items-center justify-between">
          <Link to={home} className="font-display font-bold text-lg text-navy tracking-tight">
            XR <span className="text-ink">/</span> Coach Panel
          </Link>
          {profile && (
            <div className="flex items-center gap-4 text-sm">
              <span className="hidden sm:block text-slate">
                {profile.full_name || profile.email}
                <span className="ml-2 font-mono text-[11px] uppercase text-navy-light">
                  {profile.role === 'coach' ? 'Entrenador' : 'Atleta'}
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
      <main className="max-w-6xl mx-auto px-5 sm:px-8 py-10">{children}</main>
    </div>
  )
}
