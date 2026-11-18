import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../supabaseClient'
import { useT } from '../../i18n'
import { ui } from '../../ui/ui'

export default function CommunityRequestsPanel() {
  const t = useT()
  const [admin, setAdmin] = useState(false)
  const [rows, setRows] = useState([])
  const [busy, setBusy] = useState(null)

  const load = useCallback(async () => {
    const { data: isAdmin } = await supabase.rpc('is_admin_user')
    if (isAdmin !== true) return
    setAdmin(true)
    const { data, error } = await supabase.from('community_requests').select('*').order('created_at', { ascending: false })
    if (error) return ui.error(error.message)
    setRows(data || [])
  }, [])

  useEffect(() => { load() }, [load])

  async function markReviewed(row) {
    setBusy(row.id)
    const { error } = await supabase.from('community_requests').update({ status: 'reviewed' }).eq('id', row.id)
    setBusy(null)
    if (error) return ui.error(error.message)
    await load()
  }

  async function openCommunity(row) {
    setBusy(row.id)
    const normalized = row.name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40)
    const slug = normalized.length >= 2 ? normalized : `zona-${row.id.slice(0, 8)}`
    const { error: createError } = await supabase.from('communities').insert({ slug, name: row.name, postal_code: row.postal_code, is_active: true })
    if (createError) {
      const { data: existing } = await supabase.from('communities').select('id,name,postal_code').eq('slug', slug).maybeSingle()
      if (!existing || existing.name.toLowerCase() !== row.name.toLowerCase() || (existing.postal_code || '') !== (row.postal_code || '')) {
        setBusy(null)
        return ui.error(createError.message)
      }
      const { error: activateError } = await supabase.from('communities').update({ is_active: true }).eq('id', existing.id)
      if (activateError) {
        setBusy(null)
        return ui.error(activateError.message)
      }
    }
    const { error } = await supabase.from('community_requests').update({ status: 'opened' }).eq('id', row.id)
    setBusy(null)
    if (error) return ui.error(error.message)
    ui.success(t('qd.admin.opened'))
    await load()
  }

  if (!admin) return null
  return <section className="mb-6 rounded-xl border border-mist bg-surface p-5 sm:p-6">
    <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
      <div><p className="font-mono text-[10px] uppercase tracking-widest text-brand">COMMUNITY GROWTH</p><h2 className="mt-1 font-display text-2xl text-navy">{t('qd.admin.title')}</h2></div>
      <span className="rounded-full bg-brand/15 px-3 py-1 font-mono text-xs text-navy">{rows.filter((r) => r.status === 'pending').length} {t('qd.admin.pending')}</span>
    </div>
    <p className="mb-4 max-w-2xl text-sm text-slate">{t('qd.admin.help')}</p>
    {rows.length === 0 ? <p className="text-sm text-slate">{t('qd.admin.empty')}</p> : <ul className="divide-y divide-mist">
      {rows.map((row) => <li key={row.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
        <div><p className="font-semibold text-navy">{row.name}{row.postal_code ? ` · ${row.postal_code}` : ''}</p><p className="mt-0.5 text-xs text-slate">{new Date(row.created_at).toLocaleDateString()} · {t(`qd.admin.status.${row.status}`)}</p></div>
        {row.status !== 'opened' && <div className="flex flex-wrap gap-2">
          <button type="button" disabled={busy === row.id} onClick={() => markReviewed(row)} className="rounded-md border border-mist px-3 py-2 text-xs font-semibold text-navy hover:border-brand disabled:opacity-60">{t('qd.admin.review')}</button>
          <button type="button" disabled={busy === row.id} onClick={() => openCommunity(row)} className="rounded-md bg-brand px-3 py-2 text-xs font-bold text-navy hover:bg-brand-deep hover:text-white disabled:opacity-60">{t('qd.admin.open')}</button>
        </div>}
      </li>)}
    </ul>}
  </section>
}
