import { useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import { useT } from '../i18n'
import AuthShell from '../components/AuthShell'

export default function ForgotPassword() {
  const t = useT()
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    // El enlace vuelve a esta misma aplicación (sin el # de la ruta).
    const redirectTo = `${window.location.origin}${window.location.pathname}`
    const { error: err } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo })
    setLoading(false)
    if (err) {
      setError(err.message)
      return
    }
    // Mismo mensaje exista o no la cuenta: no se revela qué correos están registrados.
    setSent(true)
  }

  return (
    <AuthShell>
      <h1 className="font-display text-xl text-navy mb-1">{t('auth.forgotTitle')}</h1>
      {sent ? (
        <p className="text-sm text-slate mt-3">{t('auth.forgotSent')}</p>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4 mt-3">
          <p className="text-sm text-slate">{t('auth.forgotBody')}</p>
          <label className="block">
            <span className="block font-mono text-xs text-slate mb-1.5">{t('auth.email')}</span>
            <input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className="w-full border border-mist rounded-md px-3 py-3 text-base focus:outline-none focus:border-navy-light" />
          </label>
          {error && <p role="alert" className="text-sm text-red">{error}</p>}
          <button type="submit" disabled={loading} className="w-full bg-brand hover:bg-brand-deep text-white font-semibold py-3 rounded-md disabled:opacity-60">
            {loading ? t('common.saving') : t('auth.forgotSend')}
          </button>
        </form>
      )}
      <p className="mt-6 text-center">
        <Link to="/login" className="text-navy font-semibold hover:text-red text-sm">{t('auth.goLogin')}</Link>
      </p>
    </AuthShell>
  )
}
