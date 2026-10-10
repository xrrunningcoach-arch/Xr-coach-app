import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import { useT } from '../i18n'
import AuthShell from '../components/AuthShell'
import { LEGAL_VERSION } from '../lib/legal'

// El enlace de invitación puede traer el código: #/signup?code=XR-AB12CD34
function codeFromUrl() {
  try {
    const q = window.location.hash.split('?')[1] || ''
    return (new URLSearchParams(q).get('code') || '').trim()
  } catch {
    return ''
  }
}

export default function Signup() {
  const t = useT()
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [inviteCode, setInviteCode] = useState(codeFromUrl)
  const [inviteRequired, setInviteRequired] = useState(false)
  const [consent, setConsent] = useState(false)
  const [error, setError] = useState(null)
  const [done, setDone] = useState(false)
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()

  // ¿El entrenador exige código de invitación? Si la migración 0005 aún no
  // está aplicada, la llamada falla y simplemente no se pide código.
  useEffect(() => {
    let alive = true
    supabase.rpc('invite_required').then(({ data, error: err }) => {
      if (alive && !err) setInviteRequired(data === true)
    })
    return () => {
      alive = false
    }
  }, [])

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    if (inviteRequired) {
      const { data: ok, error: chkErr } = await supabase.rpc('check_invite_code', { p_code: inviteCode.trim() })
      if (chkErr || ok !== true) {
        setLoading(false)
        setError(chkErr ? chkErr.message : t('auth.inviteInvalid'))
        return
      }
    }

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: fullName,
          invite_code: inviteRequired ? inviteCode.trim() : undefined,
          consent_version: LEGAL_VERSION,
          consent_at: new Date().toISOString(),
        },
      },
    })

    setLoading(false)

    if (error) {
      setError(error.message)
      return
    }

    // Con confirmación por email activada no hay sesión todavía.
    if (!data.session) {
      setDone(true)
      return
    }

    navigate('/')
  }

  if (done) {
    return (
      <AuthShell>
        <div className="text-center">
          <h1 className="font-display text-xl text-navy mb-3">{t('auth.checkEmailTitle')}</h1>
          <p className="text-sm text-slate mb-6">{t('auth.checkEmailBody')}</p>
          <Link to="/login" className="text-navy font-semibold hover:text-red text-sm">
            {t('auth.goLogin')}
          </Link>
        </div>
      </AuthShell>
    )
  }

  const field = 'w-full border border-mist rounded-md px-3 py-3 text-base focus:outline-none focus:border-navy-light'
  return (
    <AuthShell>
      <h1 className="font-display text-xl text-navy mb-1">{t('auth.createAccount')}</h1>
      <p className="text-sm text-slate mb-5">{t('auth.signupSubtitle')}</p>

      <form onSubmit={handleSubmit} className="space-y-4">
        <label className="block">
          <span className="block font-mono text-xs text-slate mb-1.5">{t('auth.fullName')}</span>
          <input type="text" required autoComplete="name" value={fullName} onChange={(e) => setFullName(e.target.value)} className={field} />
        </label>
        <label className="block">
          <span className="block font-mono text-xs text-slate mb-1.5">{t('auth.email')}</span>
          <input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className={field} placeholder="tu@ejemplo.com" />
        </label>
        <label className="block">
          <span className="block font-mono text-xs text-slate mb-1.5">{t('auth.password')}</span>
          <input type="password" required minLength={8} autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} className={field} placeholder={t('auth.passwordHint')} />
        </label>
        {inviteRequired && (
          <label className="block">
            <span className="block font-mono text-xs text-slate mb-1.5">{t('auth.inviteCode')}</span>
            <input type="text" required value={inviteCode} onChange={(e) => setInviteCode(e.target.value)} className={`${field} font-mono uppercase`} placeholder="XR-XXXXXXXX" autoCapitalize="characters" />
            <span className="block text-xs text-slate mt-1">{t('auth.inviteHelp')}</span>
          </label>
        )}

        <label className="flex items-start gap-2 text-sm text-slate">
          <input type="checkbox" required checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-1" />
          <span>
            {t('auth.consentPre')}{' '}
            <Link to="/privacidad" target="_blank" className="text-navy font-semibold underline">{t('legal.privacyShort')}</Link>
            {' '}{t('auth.consentAnd')}{' '}
            <Link to="/terminos" target="_blank" className="text-navy font-semibold underline">{t('legal.termsShort')}</Link>
            {t('auth.consentPost')}
          </span>
        </label>

        {error && <p role="alert" className="text-sm text-red">{error}</p>}

        <button type="submit" disabled={loading || !consent} className="w-full bg-brand hover:bg-brand-deep transition-colors text-white font-semibold py-3 rounded-md disabled:opacity-60">
          {loading ? t('auth.creating') : t('auth.createAccount')}
        </button>
      </form>

      <p className="text-sm text-slate mt-6 text-center">
        {t('auth.hasAccount')}{' '}
        <Link to="/login" className="text-navy font-semibold hover:text-red">
          {t('auth.signIn')}
        </Link>
      </p>
    </AuthShell>
  )
}
