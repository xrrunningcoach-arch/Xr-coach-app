// Marca XR: monograma + barra roja. Se usa en cabecera y en la pantalla de acceso.
export default function BrandMark({ size = 'md', showName = true }) {
  const box = size === 'lg' ? 'w-14 h-14 text-2xl' : 'w-9 h-9 text-base'
  return (
    <span className="inline-flex items-center gap-3">
      <span className={`${box} relative inline-flex items-center justify-center rounded-lg bg-navy-deep border border-mist font-display font-bold text-white leading-none`}>
        XR
        <span className="absolute bottom-1.5 left-1/2 -translate-x-1/2 w-1/2 h-[3px] rounded-full bg-brand" />
      </span>
      {showName && (
        <span className="font-display font-bold tracking-tight text-navy leading-tight">
          <span className={size === 'lg' ? 'text-2xl' : 'text-lg'}>Running Coach</span>
        </span>
      )}
    </span>
  )
}
