import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import { useAuth } from '../auth/AuthProvider'
import { useT } from '../i18n'
import AuthShell from '../components/AuthShell'
import LoadingScreen from '../components/LoadingScreen'

// Se llega aquí desde el enlace del correo (Supabase abre una sesión de recuperación).
export default function ResetPassword() {
  const t = useT()
  const { session, loading: authLoading } = useAuth()
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [repeat, setRepeat] = useState('')
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)

  if (authLoading) return <LoadingScreen />

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)
    if (password.length < 8) return setError(t('auth.passwordHint'))
    if (password !== repeat) return setError(t('auth.passwordMismatch'))
    setLoading(true)
    const { error: err } = await supabase.auth.updateUser({ password })
    setLoading(false)
    if (err) return setError(err.message)
    navigate('/')
  }

  const field = 'w-full border border-mist rounded-md px-3 py-3 text-base focus:outline-none focus:border-navy-light'
  return (
    <AuthShell>
      <h1 className="font-display text-xl text-navy mb-3">{t('auth.resetTitle')}</h1>
      {!session ? (
        <>
          <p className="text-sm text-slate">{t('auth.resetExpired')}</p>
          <p className="mt-4"><Link to="/recuperar" className="text-navy font-semibold hover:text-red text-sm">{t('auth.forgotTitle')}</Link></p>
        </>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <label className="block">
            <span className="block font-mono text-xs text-slate mb-1.5">{t('auth.newPassword')}</span>
            <input type="password" required minLength={8} autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} className={field} />
          </label>
          <label className="block">
            <span className="block font-mono text-xs text-slate mb-1.5">{t('auth.repeatPassword')}</span>
            <input type="password" required minLength={8} autoComplete="new-password" value={repeat} onChange={(e) => setRepeat(e.target.value)} className={field} />
          </label>
          {error && <p role="alert" className="text-sm text-red">{error}</p>}
          <button type="submit" disabled={loading} className="w-full bg-brand hover:bg-brand-deep text-white font-semibold py-3 rounded-md disabled:opacity-60">
            {loading ? t('common.saving') : t('auth.resetSave')}
          </button>
        </form>
      )}
    </AuthShell>
  )
}
