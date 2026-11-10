import { useEffect, useState } from 'react'
import { useLang } from '../../i18n'
import { ui } from '../../ui/ui'
import { suggestDisplayName } from '../../lib/meetups'
import { fetchCommunities, saveSocialProfile } from '../../lib/quedadasApi'

const inputCls = 'w-full border border-mist rounded-md px-3 py-2.5 text-sm'
const labelCls = 'block font-mono text-xs text-slate mb-1'

// Primer paso: perfil social con consentimiento explícito (18+, normas y
// visibilidad del nombre). Sin esto no se ve ni se crea ninguna quedada.
export default function SocialOptIn({ user, profile, onDone }) {
  const { t } = useLang()
  const [communities, setCommunities] = useState([])
  const [communityId, setCommunityId] = useState('')
  const [name, setName] = useState(() => suggestDisplayName(profile?.full_name))
  const [adult, setAdult] = useState(false)
  const [rules, setRules] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let alive = true
    fetchCommunities()
      .then((list) => {
        if (!alive) return
        setCommunities(list)
        if (list.length === 1) setCommunityId(list[0].id)
      })
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [])

  const ready = communityId && name.trim().length >= 2 && adult && rules

  async function submit(e) {
    e.preventDefault()
    if (!ready) return
    setBusy(true)
    try {
      await saveSocialProfile({ userId: user.id, communityId, displayName: name })
      ui.success(t('qd.optin.saved'))
      await onDone()
    } catch (err) {
      ui.error(t('qd.err.generic', { msg: err.message }))
    }
    setBusy(false)
  }

  return (
    <form onSubmit={submit} className="bg-surface border border-mist rounded-xl p-6 space-y-5 max-w-xl">
      <div>
        <h2 className="font-display text-2xl text-navy">{t('qd.optin.title')}</h2>
        <p className="text-sm text-slate mt-1">{t('qd.optin.intro')}</p>
      </div>

      <label className="block">
        <span className={labelCls}>{t('qd.optin.community')}</span>
        <select value={communityId} onChange={(e) => setCommunityId(e.target.value)} className={inputCls} required>
          <option value="" disabled>
            —
          </option>
          {communities.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
              {c.postal_code ? ` (${c.postal_code})` : ''}
            </option>
          ))}
        </select>
      </label>

      <label className="block">
        <span className={labelCls}>{t('qd.optin.displayName')}</span>
        <input value={name} onChange={(e) => setName(e.target.value)} maxLength={40} className={inputCls} required />
        <span className="block text-xs text-slate mt-1">{t('qd.optin.displayHelp')}</span>
      </label>

      <div>
        <p className="font-semibold text-sm text-navy mb-1">{t('qd.rules.title')}</p>
        <ul className="list-disc pl-5 text-sm text-slate space-y-0.5">
          {[1, 2, 3, 4, 5].map((n) => (
            <li key={n}>{t(`qd.rules.${n}`)}</li>
          ))}
        </ul>
      </div>

      <label className="flex items-start gap-2 text-sm text-slate">
        <input type="checkbox" checked={adult} onChange={(e) => setAdult(e.target.checked)} className="mt-1" />
        <span>{t('qd.optin.adult')}</span>
      </label>
      <label className="flex items-start gap-2 text-sm text-slate">
        <input type="checkbox" checked={rules} onChange={(e) => setRules(e.target.checked)} className="mt-1" />
        <span>{t('qd.optin.rules')}</span>
      </label>

      <button type="submit" disabled={!ready || busy} className="px-5 py-2.5 bg-brand hover:bg-brand-deep text-white text-sm font-semibold rounded-md disabled:opacity-60">
        {busy ? t('common.saving') : t('qd.optin.save')}
      </button>
    </form>
  )
}
