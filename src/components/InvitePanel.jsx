import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import { useT } from '../i18n'
import { ui } from '../ui/ui'
import Modal from './Modal'

function inviteUrl(code) {
  const base = `${window.location.origin}${window.location.pathname}#/signup`
  return code ? `${base}?code=${encodeURIComponent(code)}` : base
}

async function copy(text, t) {
  try {
    await navigator.clipboard.writeText(text)
    ui.success(t('invites.copied'))
  } catch {
    ui.info(text, 12000)
  }
}

// Ventana «Invitar atletas»: enlace de registro y códigos de invitación
// (opcionales; requieren la migración 0005).
export default function InvitePanel({ onClose }) {
  const t = useT()
  const [codes, setCodes] = useState([])
  const [required, setRequired] = useState(false)
  const [available, setAvailable] = useState(true)
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState({ note: '', max: 1, days: 30 })
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    const [{ data: req, error: e1 }, { data: list, error: e2 }] = await Promise.all([
      supabase.rpc('invite_required'),
      supabase.from('invite_codes').select('*').order('created_at', { ascending: false }),
    ])
    if (e1 || e2) setAvailable(false)
    else {
      setRequired(req === true)
      setCodes(list || [])
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    load()
  }, [load])

  async function toggleRequired() {
    setBusy(true)
    const { error } = await supabase.rpc('set_invite_required', { p_required: !required })
    setBusy(false)
    if (error) return ui.error(error.message)
    setRequired(!required)
  }

  async function createCode(e) {
    e.preventDefault()
    setBusy(true)
    const { data, error } = await supabase.rpc('create_invite_code', {
      p_note: form.note,
      p_max_uses: Number(form.max) || 1,
      p_days: Number(form.days) || 0,
    })
    setBusy(false)
    if (error) return ui.error(error.message)
    ui.success(`${t('invites.created')}: ${data}`)
    setForm({ ...form, note: '' })
    load()
  }

  async function setActive(code, is_active) {
    const { error } = await supabase.from('invite_codes').update({ is_active }).eq('code', code)
    if (error) ui.error(error.message)
    else load()
  }

  async function remove(code) {
    if (!(await ui.confirm(code, { title: t('invites.delete'), danger: true, confirmLabel: t('invites.delete') }))) return
    const { error } = await supabase.from('invite_codes').delete().eq('code', code)
    if (error) ui.error(error.message)
    else load()
  }

  const stateOf = (c) => {
    if (!c.is_active) return t('invites.inactive')
    if (c.uses >= c.max_uses) return t('invites.exhausted')
    if (c.expires_at && new Date(c.expires_at) < new Date()) return t('invites.expired')
    return null
  }
  const field = 'w-full border border-mist rounded-md px-3 py-2.5 text-sm'

  return (
    <Modal title={t('invites.title')} onClose={onClose} wide>
      <div className="space-y-6">
        <section>
          <p className="font-mono text-[11px] uppercase text-navy-light mb-1">{t('invites.link')}</p>
          <div className="flex gap-2">
            <input readOnly value={inviteUrl()} className={`${field} font-mono text-xs`} onFocus={(e) => e.target.select()} />
            <button type="button" onClick={() => copy(inviteUrl(), t)} className="shrink-0 px-4 py-2.5 bg-brand hover:bg-brand-deep text-white text-sm font-semibold rounded-md">
              {t('invites.copyLink')}
            </button>
          </div>
        </section>

        {loading ? null : !available ? (
          <p className="text-sm text-slate bg-bg-dim rounded-md p-4">{t('invites.needMigration')}</p>
        ) : (
          <>
            <section className="flex items-start justify-between gap-4 bg-bg-dim rounded-lg p-4">
              <div>
                <p className="font-semibold text-sm text-navy">{t('invites.require')}</p>
                <p className="text-xs text-slate mt-0.5">{t('invites.requireHelp')}</p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={required}
                disabled={busy}
                onClick={toggleRequired}
                className={`relative shrink-0 w-12 h-7 rounded-full transition-colors ${required ? 'bg-brand' : 'bg-mist'}`}
              >
                <span className={`absolute top-1 w-5 h-5 rounded-full bg-white transition-all ${required ? 'left-6' : 'left-1'}`} />
                <span className="sr-only">{t('invites.require')}</span>
              </button>
            </section>

            <form onSubmit={createCode} className="grid sm:grid-cols-[1fr_90px_110px_auto] gap-3 items-end">
              <label className="block">
                <span className="block font-mono text-[11px] uppercase text-slate mb-1">{t('invites.note')}</span>
                <input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} maxLength={120} className={field} />
              </label>
              <label className="block">
                <span className="block font-mono text-[11px] uppercase text-slate mb-1">{t('invites.maxUses')}</span>
                <input type="number" min={1} max={500} value={form.max} onChange={(e) => setForm({ ...form, max: e.target.value })} className={field} />
              </label>
              <label className="block">
                <span className="block font-mono text-[11px] uppercase text-slate mb-1">{t('invites.days')}</span>
                <input type="number" min={0} max={365} value={form.days} onChange={(e) => setForm({ ...form, days: e.target.value })} className={field} />
              </label>
              <button type="submit" disabled={busy} className="px-4 py-2.5 bg-primary hover:bg-primary-hover text-white text-sm font-semibold rounded-md disabled:opacity-60">
                {t('invites.newCode')}
              </button>
            </form>

            {codes.length === 0 ? (
              <p className="text-sm text-slate">{t('invites.noCodes')}</p>
            ) : (
              <ul className="divide-y divide-mist border border-mist rounded-lg">
                {codes.map((c) => {
                  const state = stateOf(c)
                  return (
                    <li key={c.code} className="p-3 flex flex-wrap items-center gap-x-4 gap-y-2">
                      <div className="flex-1 min-w-[180px]">
                        <p className={`font-mono text-sm font-semibold ${state ? 'text-slate line-through' : 'text-navy'}`}>{c.code}</p>
                        <p className="text-xs text-slate">
                          {[c.note, t('invites.uses', { used: c.uses, max: c.max_uses }), c.expires_at ? t('invites.expires', { date: c.expires_at.slice(0, 10) }) : null]
                            .filter(Boolean)
                            .join(' · ')}
                        </p>
                      </div>
                      {state && <span className="font-mono text-[11px] text-red">{state}</span>}
                      <div className="flex gap-2">
                        {!state && (
                          <button type="button" onClick={() => copy(inviteUrl(c.code), t)} className="text-xs font-semibold border border-mist rounded-md px-3 py-1.5 text-navy hover:border-navy-light">
                            {t('invites.copyInviteLink')}
                          </button>
                        )}
                        <button type="button" onClick={() => setActive(c.code, !c.is_active)} className="text-xs font-semibold border border-mist rounded-md px-3 py-1.5 text-slate hover:text-navy">
                          {c.is_active ? t('invites.deactivate') : t('invites.activate')}
                        </button>
                        <button type="button" onClick={() => remove(c.code)} className="text-xs font-semibold border border-red/40 rounded-md px-3 py-1.5 text-red hover:text-red-deep">
                          {t('invites.delete')}
                        </button>
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </>
        )}
      </div>
    </Modal>
  )
}
