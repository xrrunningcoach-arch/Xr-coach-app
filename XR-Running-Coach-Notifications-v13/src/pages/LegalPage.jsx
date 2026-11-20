import { Link } from 'react-router-dom'
import AuthShell from '../components/AuthShell'
import { LEGAL, LEGAL_VERSION } from '../lib/legal'
import { useLang, useT } from '../i18n'

// Páginas públicas: /privacidad y /terminos (accesibles sin iniciar sesión).
export default function LegalPage({ kind }) {
  const { lang } = useLang()
  const t = useT()
  const doc = LEGAL[kind][lang] || LEGAL[kind].es
  return (
    <AuthShell>
      <h1 className="font-display text-xl text-navy mb-1">{doc.title}</h1>
      <p className="font-mono text-[11px] text-slate mb-4">{t('legal.version', { v: LEGAL_VERSION })}</p>
      <div className="space-y-4 text-sm text-slate">
        {doc.sections.map((s) => (
          <section key={s.title}>
            <h2 className="font-semibold text-navy mb-1">{s.title}</h2>
            {s.paras.map((p, i) => <p key={i} className="mb-1.5">{p}</p>)}
          </section>
        ))}
      </div>
      <p className="mt-6 text-center">
        <Link to="/login" className="text-navy font-semibold hover:text-red text-sm">{t('auth.goLogin')}</Link>
      </p>
    </AuthShell>
  )
}
