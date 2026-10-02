import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../supabaseClient'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    setLoading(false)
    if (error) {
      setError(error.message)
      return
    }
    navigate('/')
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-navy-deep px-5">
      <div className="w-full max-w-sm bg-white rounded-sm shadow-sm p-8">
        <h1 className="font-display text-2xl text-navy mb-1">XR Running Coach</h1>
        <p className="text-sm text-slate mb-6">Accede a tu panel de entrenamiento.</p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block font-mono text-xs text-slate mb-1.5">Correo electrónico</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full border border-mist rounded-sm px-3 py-2.5 focus:outline-none focus:border-navy"
              placeholder="tu@ejemplo.com"
            />
          </div>
          <div>
            <label className="block font-mono text-xs text-slate mb-1.5">Contraseña</label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full border border-mist rounded-sm px-3 py-2.5 focus:outline-none focus:border-navy"
              placeholder="••••••••"
            />
          </div>

          {error && <p className="text-sm text-red">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-red hover:bg-red-deep transition-colors text-white font-semibold py-2.5 rounded-sm disabled:opacity-60"
          >
            {loading ? 'Entrando…' : 'Entrar'}
          </button>
        </form>

        <p className="text-sm text-slate mt-6 text-center">
          ¿Aún no tienes cuenta?{' '}
          <Link to="/signup" className="text-navy font-semibold hover:text-red">
            Regístrate
          </Link>
        </p>
      </div>
    </div>
  )
}
