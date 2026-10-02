import { Navigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'
import LoadingScreen from './LoadingScreen'

export default function ProtectedRoute({ role, children }) {
  const { user, profile, loading, authError, refreshProfile, signOut } = useAuth()

  if (loading) return <LoadingScreen />
  if (!user) return <Navigate to="/login" replace />

  // Hay sesión pero el perfil no se pudo cargar: no hay rol al que redirigir
  // de forma fiable, así que se ofrece reintentar o salir en vez de rebotar
  // entre rutas protegidas.
  if (authError || !profile) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-bg px-5">
        <div className="max-w-sm text-center space-y-4">
          <p className="text-sm text-red" role="alert">
            {authError || 'No se ha podido cargar tu perfil.'}
          </p>
          <div className="flex items-center justify-center gap-3">
            <button
              onClick={refreshProfile}
              className="px-4 py-2 text-sm font-semibold text-white bg-navy hover:bg-navy-deep rounded-sm"
            >
              Reintentar
            </button>
            <button
              onClick={signOut}
              className="px-4 py-2 text-sm font-semibold text-slate border border-mist rounded-sm hover:border-red hover:text-red"
            >
              Salir
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (role && profile.role !== role) {
    const fallback = profile.role === 'coach' ? '/coach' : '/atleta'
    return <Navigate to={fallback} replace />
  }
  return children
}
