export default function LoadingScreen({ label = 'Cargando…' }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-bg">
      <p className="font-mono text-sm text-slate">{label}</p>
    </div>
  )
}
