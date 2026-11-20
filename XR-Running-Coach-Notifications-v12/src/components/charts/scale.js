// Máximo "bonito" para un eje vertical y marcas redondas.
export function niceMax(value) {
  if (value <= 0) return 10
  const exp = Math.pow(10, Math.floor(Math.log10(value)))
  const f = value / exp
  const nice = f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10
  return nice * exp
}

export function ticks(max, count = 4) {
  return Array.from({ length: count + 1 }, (_, i) => (max / count) * i)
}

export const INK = { grid: 'var(--chart-grid)', axis: 'var(--chart-axis)', text: 'var(--chart-text)', muted: 'var(--chart-muted)' }
