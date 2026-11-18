import { useT } from '../i18n'
import { IconCheck, IconFlag } from './icons'

function Status({ children, ready = false }) {
  return <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-mono text-[10px] uppercase tracking-wide ${ready ? 'bg-brand/15 text-navy' : 'bg-bg-dim text-slate'}`}>
    {ready && <IconCheck width={13} height={13} />}{children}
  </span>
}

export default function ConnectionsView({ onNavigate }) {
  const t = useT()
  const platforms = [
    { title: t('connections.stravaTitle'), state: t('connections.stravaState'), body: t('connections.stravaBody'), mark: 'S', accent: 'bg-[#FC4C02]' },
    { title: t('connections.corosTitle'), state: t('connections.corosState'), body: t('connections.corosBody'), mark: 'C', accent: 'bg-navy' },
    { title: t('connections.bluetoothTitle'), state: t('connections.bluetoothState'), body: t('connections.bluetoothBody'), mark: '↔', accent: 'bg-slate' },
  ]

  return <div className="max-w-4xl space-y-6">
    <header className="rounded-2xl bg-navy-deep p-6 text-white sm:p-8">
      <p className="font-mono text-[11px] uppercase tracking-[.18em] text-brand">XR · TRAINING DATA</p>
      <h1 className="mt-2 font-display text-3xl sm:text-4xl">{t('connections.title')}</h1>
      <p className="mt-2 max-w-2xl text-sm text-white/75">{t('connections.intro')}</p>
    </header>

    <section className="grid gap-4 md:grid-cols-3" aria-label={t('connections.title')}>
      {platforms.map((item) => <article key={item.title} className="flex min-h-52 flex-col rounded-xl border border-mist bg-surface p-5">
        <div className="flex items-start justify-between gap-3">
          <span className={`grid h-10 w-10 place-items-center rounded-lg text-lg font-bold text-white ${item.accent}`}>{item.mark}</span>
          <Status>{item.state}</Status>
        </div>
        <h2 className="mt-5 font-display text-xl text-navy">{item.title}</h2>
        <p className="mt-2 text-sm leading-relaxed text-slate">{item.body}</p>
      </article>)}
    </section>

    <section className="flex flex-col gap-4 rounded-xl border border-brand/50 bg-brand/10 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
      <div className="flex gap-3">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-brand text-navy"><IconFlag width={22} height={22} /></span>
        <div><Status ready>{t('connections.available')}</Status><h2 className="mt-2 font-display text-xl text-navy">{t('connections.manualTitle')}</h2><p className="mt-1 max-w-2xl text-sm text-slate">{t('connections.manualBody')}</p></div>
      </div>
      <button type="button" onClick={() => onNavigate('hoy')} className="shrink-0 rounded-md bg-brand px-4 py-3 text-sm font-bold text-navy transition hover:bg-brand-deep hover:text-white">{t('connections.manualAction')} →</button>
    </section>
  </div>
}
