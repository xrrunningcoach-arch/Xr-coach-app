// Zonas de FC (Z1 a Z5). Los rangos en ppm los escribe SIEMPRE el entrenador,
// desde su criterio: la app no calcula ni deriva zonas automáticamente.
export const HR_ZONES = [
  { code: 'Z1', rpe: 'RPE 1 - 3' },
  { code: 'Z2', rpe: 'RPE 4 - 5' },
  { code: 'Z3', rpe: 'RPE 6 - 7' },
  { code: 'Z4', rpe: 'RPE 8 - 8.5' },
  { code: 'Z5', rpe: 'RPE 9 - 10' },
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
// FC máx. única para toda la app. Orden de prioridad (la primera válida):
// test de umbrales más reciente > FC máx. del plan (hr_zones) > perfil del atleta.
export function pickMaxHr(...candidates) {
  for (const c of candidates) {
    const n = Number(c)
    if (Number.isFinite(n) && n >= 100 && n <= 250) return n
  }
  return null
}

// ---------------------------------------------------------------------------
// Zonas manuales del entrenador (tabla athlete_hr_zones, migración 0004).
// manualZones = { Z1: { lo: 110, hi: 125 }, Z3: { lo: 140, hi: 155 } }
// Solo existen las zonas que el entrenador ha escrito; las demás quedan sin definir.
// ---------------------------------------------------------------------------

export const MANUAL_MIN_BPM = 30
export const MANUAL_MAX_BPM = 250

// Limpia lo que llega de la base de datos: solo zonas válidas con lo < hi.
export function sanitizeManualZones(raw) {
  const out = {}
  if (!raw || typeof raw !== 'object') return out
  HR_ZONES.forEach((z) => {
    const v = raw[z.code]
    const lo = Number(v?.lo)
    const hi = Number(v?.hi)
    if (Number.isFinite(lo) && Number.isFinite(hi) && lo >= MANUAL_MIN_BPM && hi <= MANUAL_MAX_BPM && lo < hi) {
      out[z.code] = { lo: Math.round(lo), hi: Math.round(hi) }
    }
  })
  return out
}

// Zonas que se muestran: solo las escritas por el entrenador. `maxHr` es
// opcional y solo sirve para indicar a qué % de la FC máx. equivale cada rango.
export function resolveZones({ maxHr, manualZones }) {
  const manual = sanitizeManualZones(manualZones)
  return HR_ZONES.map((z) => {
    const m = manual[z.code]
    const range = m ? [m.lo, m.hi] : null
    const pct = range && maxHr ? `${Math.round((range[0] / maxHr) * 100)}% - ${Math.round((range[1] / maxHr) * 100)}%` : '—'
    return { ...z, range, source: m ? 'manual' : 'empty', pctLabel: pct }
  })
}

// Valida el formulario del entrenador. fields = { Z1: { lo: '110', hi: '125' }, ... }
// Una zona con ambos campos vacíos = "automática". Devuelve las zonas válidas y
// un mensaje por zona con problemas.
export function parseManualForm(fields) {
  const zones = {}
  const errors = {}
  HR_ZONES.forEach((z) => {
    const loRaw = String(fields?.[z.code]?.lo ?? '').trim()
    const hiRaw = String(fields?.[z.code]?.hi ?? '').trim()
    if (loRaw === '' && hiRaw === '') return
    if (loRaw === '' || hiRaw === '') {
      errors[z.code] = 'Rellena el mínimo y el máximo, o deja los dos vacíos para dejar la zona sin definir.'
      return
    }
    const lo = Number(loRaw)
    const hi = Number(hiRaw)
    if (!Number.isInteger(lo) || !Number.isInteger(hi)) {
      errors[z.code] = 'Usa números enteros (ppm).'
    } else if (lo < MANUAL_MIN_BPM || hi > MANUAL_MAX_BPM) {
      errors[z.code] = `Los valores deben estar entre ${MANUAL_MIN_BPM} y ${MANUAL_MAX_BPM} ppm.`
    } else if (lo >= hi) {
      errors[z.code] = 'El mínimo debe ser menor que el máximo.'
    } else {
      zones[z.code] = { lo, hi }
    }
  })
  return { zones, errors }
}

// Avisos (no bloquean): zonas contiguas que se solapan o van desordenadas.
export function manualZoneWarnings(zones) {
  const warnings = []
  const codes = HR_ZONES.map((z) => z.code).filter((c) => zones[c])
  for (let i = 1; i < codes.length; i += 1) {
    const prev = zones[codes[i - 1]]
    const cur = zones[codes[i]]
    if (cur.lo < prev.lo) warnings.push(`${codes[i]} empieza por debajo de ${codes[i - 1]}.`)
    else if (cur.lo < prev.hi) warnings.push(`${codes[i - 1]} y ${codes[i]} se solapan (${cur.lo} < ${prev.hi} ppm).`)
  }
  return warnings
}
