// Zonas de entrenamiento por % de la FC máxima — igual que la hoja
// "Zonas de Entrenamiento" del Excel (códigos Z1 a Z5).
export const HR_ZONES = [
  { code: 'Z1', lo: 0.5, hi: 0.6, rpe: 'RPE 1 - 3' },
  { code: 'Z2', lo: 0.6, hi: 0.7, rpe: 'RPE 4 - 5' },
  { code: 'Z3', lo: 0.7, hi: 0.8, rpe: 'RPE 6 - 7' },
  { code: 'Z4', lo: 0.8, hi: 0.9, rpe: 'RPE 8 - 8.5' },
  { code: 'Z5', lo: 0.9, hi: 1.0, rpe: 'RPE 9 - 10' },
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

// Zonas ancladas a un test de umbrales (formato igual al de las manuales).
//   Z1: hasta el 90 % de VT1 · Z2: 90 % VT1 → VT1 · Z3: VT1 → punto medio
//   Z4: punto medio → VT2 (zona de umbral) · Z5: VT2 → FC máx.
// Necesita VT1 y VT2 (ppm). Devuelve {} si faltan o son incoherentes.
export function zonesFromThresholds({ vt1Hr, vt2Hr, maxHr }) {
  const vt1 = Number(vt1Hr)
  const vt2 = Number(vt2Hr)
  if (!Number.isFinite(vt1) || !Number.isFinite(vt2) || vt1 < MANUAL_MIN_BPM || vt2 > MANUAL_MAX_BPM || vt1 >= vt2) return {}
  const max = Number(maxHr) > vt2 ? Number(maxHr) : Math.round(vt2 * 1.06)
  const lowEdge = Math.round(vt1 * 0.9)
  const mid = Math.round((vt1 + vt2) / 2)
  const floor = Math.max(MANUAL_MIN_BPM, Math.round(vt1 * 0.7))
  return {
    Z1: { lo: floor, hi: lowEdge },
    Z2: { lo: lowEdge, hi: Math.round(vt1) },
    Z3: { lo: Math.round(vt1), hi: mid },
    Z4: { lo: mid, hi: Math.round(vt2) },
    Z5: { lo: Math.round(vt2), hi: Math.min(MANUAL_MAX_BPM, Math.round(max)) },
  }
}

export function zoneRange(maxHr, zone) {
  if (!maxHr) return null
  return [Math.round(maxHr * zone.lo), Math.round(maxHr * zone.hi)]
}

// ---------------------------------------------------------------------------
// Zonas manuales del entrenador (tabla athlete_hr_zones, migración 0004).
// manualZones = { Z1: { lo: 110, hi: 125 }, Z3: { lo: 140, hi: 155 } }
// Cada zona fijada a mano TIENE PRIORIDAD sobre el cálculo por % de FC máxima;
// las zonas que el entrenador no toca siguen calculándose automáticamente.
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

// Zonas finales que se muestran: manual si existe, si no automática.
export function resolveZones({ maxHr, manualZones, testZones }) {
  const manual = sanitizeManualZones(manualZones)
  const fromTest = sanitizeManualZones(testZones)
  return HR_ZONES.map((z) => {
    const auto = zoneRange(maxHr, z)
    const m = manual[z.code] || fromTest[z.code]
    const fixed = manual[z.code] ? 'manual' : fromTest[z.code] ? 'test' : 'auto'
    const range = m ? [m.lo, m.hi] : auto
    const pct = range && maxHr ? [Math.round((range[0] / maxHr) * 100), Math.round((range[1] / maxHr) * 100)] : null
    return {
      ...z,
      auto,
      range,
      source: fixed,
      // % real que representa el rango usado (si hay FC máx); si no, el teórico de la zona.
      pctLabel: m
        ? pct
          ? `${pct[0]}% - ${pct[1]}%`
          : '—'
        : `${Math.round(z.lo * 100)}% - ${Math.round(z.hi * 100)}%`,
    }
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
      errors[z.code] = 'Rellena el mínimo y el máximo, o deja los dos vacíos para usar el cálculo automático.'
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
