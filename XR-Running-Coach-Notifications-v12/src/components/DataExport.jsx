import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'
import { useT } from '../i18n'
import { ui } from '../ui/ui'
import { collectAthleteData, downloadJson } from '../lib/exportData'
import { todayISO } from '../lib/dates'

// Descarga de datos personales + enlaces legales (sección Perfil del atleta).
export default function DataExport() {
  const { user } = useAuth()
  const t = useT()
  const [busy, setBusy] = useState(false)

  async function handleDownload() {
    setBusy(true)
    try {
      const data = await collectAthleteData(user.id)
      downloadJson(data, `xr-running-coach-mis-datos-${todayISO()}.json`)
    } catch (e) {
      ui.error(t('export.error', { msg: e.message }))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="bg-surface border border-mist rounded-xl p-6 space-y-3">
      <h2 className="font-display text-xl text-navy">{t('export.title')}</h2>
      <p className="text-sm text-slate">{t('export.body')}</p>
      <button type="button" onClick={handleDownload} disabled={busy} className="px-4 py-2 bg-brand hover:bg-brand-deep text-white text-sm font-semibold rounded-sm disabled:opacity-60">
        {busy ? t('export.busy') : t('export.button')}
      </button>
      <p className="text-xs text-slate">
        <Link to="/privacidad" className="underline">{t('legal.privacyShort')}</Link> · <Link to="/terminos" className="underline">{t('legal.termsShort')}</Link>
      </p>
    </div>
  )
}
