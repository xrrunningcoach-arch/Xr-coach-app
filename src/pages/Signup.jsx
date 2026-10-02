import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../supabaseClient'

export default function Signup() {
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(null)
  const [done, setDone] = useState(false)
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName } },
    })

    setLoading(false)

    if (error) {
      setError(error.message)
      return
    }

    // Si el proyecto de Supabase tiene confirmación por email activada,
    // no habrá sesión todavía y hay que avisar al usuario.
    if (!data.session) {
      setDone(true)
      return
    }

    navigate('/')
  }

  if (done) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-navy-deep px-5">
        <div className="w-full max-w-sm bg-white rounded-sm shadow-sm p-8 text-center">
          <h1 className="font-display text-xl text-navy mb-3">Revisa tu correo</h1>
          <p className="text-sm text-slate mb-6">
            Te hemos enviado un enlace de confirmación. Confírmalo y después inicia sesión.
          </p>
          <Link to="/login" className="text-navy font-semibold hover:text-red text-sm">
            Ir a iniciar sesión
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-navy-deep px-5">
      <div className="w-full max-w-sm bg-white rounded-sm shadow-sm p-8">
        <h1 className="font-display text-2xl text-navy mb-1">Crear cuenta</h1>
        <p className="text-sm text-slate mb-6">
          Regístrate como atleta. Tu entrenador te asignará un plan una vez creada la cuenta.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block font-mono text-xs text-slate mb-1.5">Nombre completo</label>
            <input
              type="text"
              required
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="w-full border border-mist rounded-sm px-3 py-2.5 focus:outline-none focus:border-navy"
              placeholder="Tu nombre"
            />
          </div>
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
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full border border-mist rounded-sm px-3 py-2.5 focus:outline-none focus:border-navy"
              placeholder="Mínimo 6 caracteres"
            />
          </div>

          {error && <p className="text-sm text-red">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-navy hover:bg-navy-deep transition-colors text-white font-semibold py-2.5 rounded-sm disabled:opacity-60"
          >
            {loading ? 'Creando cuenta…' : 'Crear cuenta'}
          </button>
        </form>

        <p className="text-sm text-slate mt-6 text-center">
          ¿Ya tienes cuenta?{' '}
          <Link to="/login" className="text-navy font-semibold hover:text-red">
            Inicia sesión
          </Link>
        </p>
      </div>
    </div>
  )
}
