import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import { useT } from '../i18n'
import AuthShell from '../components/AuthShell'

export default function Login() {
  const t = useT()
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
    <AuthShell>
      <p className="text-sm text-slate mb-5">{t('auth.loginSubtitle')}</p>
      <form onSubmit={handleSubmit} className="space-y-4">
        <label className="block">
          <span className="block font-mono text-xs text-slate mb-1.5">{t('auth.email')}</span>
          <input
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full border border-mist rounded-md px-3 py-3 text-base focus:outline-none focus:border-navy-light"
            placeholder="tu@ejemplo.com"
          />
        </label>
        <label className="block">
          <span className="block font-mono text-xs text-slate mb-1.5">{t('auth.password')}</span>
          <input
            type="password"
            required
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full border border-mist rounded-md px-3 py-3 text-base focus:outline-none focus:border-navy-light"
            placeholder="••••••••"
          />
        </label>

        {error && <p role="alert" className="text-sm text-red">{error}</p>}

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-brand hover:bg-brand-deep transition-colors text-white font-semibold py-3 rounded-md disabled:opacity-60"
        >
          {loading ? t('auth.signingIn') : t('auth.signIn')}
        </button>
      </form>

      <p className="text-sm text-slate mt-4 text-center">
        <Link to="/recuperar" className="text-navy hover:text-red">
          {t('auth.forgot')}
        </Link>
      </p>

      <p className="text-sm text-slate mt-4 text-center">
        {t('auth.noAccount')}{' '}
        <Link to="/signup" className="text-navy font-semibold hover:text-red">
          {t('auth.signUp')}
        </Link>
      </p>
    </AuthShell>
  )
}
