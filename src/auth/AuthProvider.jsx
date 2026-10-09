import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { supabase } from '../supabaseClient'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [authError, setAuthError] = useState(null)

  // Consulta el perfil y devuelve el resultado; no toca el estado por sí sola,
  // para que quien la llama decida cuándo marcar loading:false (evita el
  // bucle de redirección: nunca hay un instante con sesión pero perfil null).
  const fetchProfile = useCallback(async (userId) => {
    if (!userId) return { data: null, error: null }
    return supabase.from('profiles').select('*').eq('id', userId).single()
  }, [])

  const applySession = useCallback(
    async (nextSession) => {
      setSession(nextSession)
      const userId = nextSession?.user?.id
      if (!userId) {
        setProfile(null)
        setAuthError(null)
        return
      }
      const { data, error } = await fetchProfile(userId)
      if (error) {
        console.error('Error cargando el perfil:', error.message)
        setProfile(null)
        setAuthError('No se ha podido cargar tu perfil. Puedes reintentarlo o salir.')
      } else {
        setProfile(data)
        setAuthError(null)
      }
    },
    [fetchProfile]
  )

  useEffect(() => {
    let mounted = true

    supabase.auth.getSession().then(async ({ data: { session: initialSession } }) => {
      if (!mounted) return
      await applySession(initialSession)
      if (mounted) setLoading(false)
    })

    // onAuthStateChange no debe bloquearse con await directo (recomendación de
    // Supabase); se delega en una promesa aparte para no colgar el listener.
    const { data: listener } = supabase.auth.onAuthStateChange((event, nextSession) => {
      // Llegada desde el enlace de «he olvidado mi contraseña».
      if (event === 'PASSWORD_RECOVERY') window.location.hash = '#/restablecer'
      applySession(nextSession)
    })

    return () => {
      mounted = false
      listener.subscription.unsubscribe()
    }
  }, [applySession])

  const refreshProfile = useCallback(() => applySession(session), [applySession, session])

  const signOut = useCallback(() => supabase.auth.signOut(), [])

  const value = {
    session,
    user: session?.user ?? null,
    profile,
    role: profile?.role ?? null,
    loading,
    authError,
    refreshProfile,
    signOut,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth debe usarse dentro de <AuthProvider>')
  return ctx
}
