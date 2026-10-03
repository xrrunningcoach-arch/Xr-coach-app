// Zonas de entrenamiento por % de la FC máxima — igual que la hoja
// "Zonas de Entrenamiento" del Excel (códigos Z1 a Z5).
export const HR_ZONES = [
  { code: 'Z1', name: 'Regenerativo', lo: 0.5, hi: 0.6, rpe: 'RPE 1 - 3', use: 'Calentamiento, enfriamiento, rodaje regenerativo' },
  { code: 'Z2', name: 'Aeróbico Base', lo: 0.6, hi: 0.7, rpe: 'RPE 4 - 5', use: 'Rodajes suaves de acumulación y base aeróbica' },
  { code: 'Z3', name: 'Tempo / Aeróbico Fuerte', lo: 0.7, hi: 0.8, rpe: 'RPE 6 - 7', use: 'Progresivos, tempo y ritmos de crucero' },
  { code: 'Z4', name: 'Umbral', lo: 0.8, hi: 0.9, rpe: 'RPE 8 - 8.5', use: 'Series de calidad y ritmos objetivo (10K/21K)' },
  { code: 'Z5', name: 'VO2 Máx / Series', lo: 0.9, hi: 1.0, rpe: 'RPE 9 - 10', use: 'Sprints finales, esfuerzos máximos, test' },
]

// FC máxima que se usa para calcular las zonas: la real (test de campo) si
// existe; si no, la estimada con 220 - edad (como indica el Excel).
export function effectiveMaxHr({ maxHrReal, age }) {
  const real = Number(maxHrReal)
  const ageNum = Number(age)
  const estimated = ageNum > 0 ? 220 - ageNum : null
  if (real > 0) return { value: real, source: 'real', estimated }
  if (estimated) return { value: estimated, source: 'estimada', estimated }
  return { value: null, source: null, estimated: null }
}

// Rango en pulsaciones por minuto de una zona para una FC máxima dada.
export function zoneRange(maxHr, zone) {
  if (!maxHr) return null
  return [Math.round(maxHr * zone.lo), Math.round(maxHr * zone.hi)]
}
