import { tr } from '../i18n'

export default function LoadingScreen({ label }) {
  return (
    <div className="min-h-[50dvh] flex items-center justify-center" role="status">
      <p className="font-mono text-sm text-slate">{label || tr('common.loading')}</p>
    </div>
  )
}
