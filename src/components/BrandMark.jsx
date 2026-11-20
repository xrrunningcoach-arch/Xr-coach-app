// Marca XR: monograma dinámico en verde profundo y lima.
export default function BrandMark({ size = 'md', showName = true }) {
  const box = size === 'lg' ? 'w-14 h-14' : 'w-9 h-9'
  const iconUrl = `${import.meta.env.BASE_URL}xr-running-coach-icon.svg`
  return (
    <span className="inline-flex items-center gap-3">
      <img src={iconUrl} alt="" className={`${box} shrink-0 rounded-lg object-cover`} />
      {showName && (
        <span className="font-display font-bold tracking-tight text-navy leading-tight">
          <span className={size === 'lg' ? 'text-2xl' : 'text-lg'}>Running Coach</span>
        </span>
      )}
    </span>
  )
}
