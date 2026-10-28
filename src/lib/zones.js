// Zonas de FC (Z1 a Z5). Los rangos de pulso (bpm) y de ritmo (m:ss /km) los escribe
// SIEMPRE el entrenador, desde su criterio: la app no calcula ni deriva zonas
// (tampoco con 220 - edad).
export const HR_ZONES = [
  { code: 'Z1', rpe: 'RPE 1 - 3' },
  { code: 'Z2', rpe: 'RPE 4 - 5' },
  { code: 'Z3', rpe: 'RPE 6 - 7' },
  { code: 'Z4', rpe: 'RPE 8 - 8.5' },
  { code: 'Z5', rpe: 'RPE 9 - 10' },
]

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

// Ritmos: segundos por km. Se escriben como m:ss (por ejemplo, 4:25).
export const PACE_MIN_S = 120 // 2:00 /km
export const PACE_MAX_S = 1200 // 20:00 /km

export function parsePace(text) {
  const m = /^(\d{1,2}):([0-5]\d)$/.exec(String(text ?? '').trim())
  if (!m) return null
  const s = Number(m[1]) * 60 + Number(m[2])
  return s >= PACE_MIN_S && s <= PACE_MAX_S ? s : null
}

export function formatPaceSec(s) {
  const n = Number(s)
  return Number.isFinite(n) && n > 0 ? `${Math.floor(n / 60)}:${String(Math.round(n % 60)).padStart(2, '0')}` : '—'
}

// Limpia lo que llega de la base de datos: solo zonas válidas con lo < hi.
// Si la zona trae ritmo (pace_from <= pace_to, en s/km) también se conserva.
export function sanitizeManualZones(raw) {
  const out = {}
  if (!raw || typeof raw !== 'object') return out
  HR_ZONES.forEach((z) => {
    const v = raw[z.code]
    const lo = Number(v?.lo)
    const hi = Number(v?.hi)
    if (Number.isFinite(lo) && Number.isFinite(hi) && lo >= MANUAL_MIN_BPM && hi <= MANUAL_MAX_BPM && lo < hi) {
      out[z.code] = { lo: Math.round(lo), hi: Math.round(hi) }
      const pf = Number(v?.pace_from)
      const pt = Number(v?.pace_to)
      if (Number.isFinite(pf) && Number.isFinite(pt) && pf >= PACE_MIN_S && pt <= PACE_MAX_S && pf <= pt) {
        out[z.code].pace_from = Math.round(pf)
        out[z.code].pace_to = Math.round(pt)
      }
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
    const pace = m && m.pace_from ? [m.pace_from, m.pace_to] : null
    const pct = range && maxHr ? `${Math.round((range[0] / maxHr) * 100)}% - ${Math.round((range[1] / maxHr) * 100)}%` : '—'
    return { ...z, range, pace, source: m ? 'manual' : 'empty', pctLabel: pct }
  })
}

// Valida el formulario del entrenador.
// fields = { Z1: { lo: '110', hi: '125', pace_from: '5:10', pace_to: '5:40' }, ... }
// Una zona con todo vacío = sin definir. Devuelve las zonas válidas y, por zona con
// problemas, un error { key, params } (la clave de traducción la muestra la pantalla).
export function parseManualForm(fields) {
  const zones = {}
  const errors = {}
  HR_ZONES.forEach((z) => {
    const f = fields?.[z.code] || {}
    const loRaw = String(f.lo ?? '').trim()
    const hiRaw = String(f.hi ?? '').trim()
    const pfRaw = String(f.pace_from ?? '').trim()
    const ptRaw = String(f.pace_to ?? '').trim()
    if (loRaw === '' && hiRaw === '' && pfRaw === '' && ptRaw === '') return
    if (loRaw === '' || hiRaw === '') {
      errors[z.code] = { key: 'zones.err.pair' }
      return
    }
    const lo = Number(loRaw)
    const hi = Number(hiRaw)
    if (!Number.isInteger(lo) || !Number.isInteger(hi)) {
      errors[z.code] = { key: 'zones.err.int' }
      return
    }
    if (lo < MANUAL_MIN_BPM || hi > MANUAL_MAX_BPM) {
      errors[z.code] = { key: 'zones.err.range', params: { min: MANUAL_MIN_BPM, max: MANUAL_MAX_BPM } }
      return
    }
    if (lo >= hi) {
      errors[z.code] = { key: 'zones.err.order' }
      return
    }
    const zone = { lo, hi }
    if (pfRaw !== '' || ptRaw !== '') {
      if (pfRaw === '' || ptRaw === '') {
        errors[z.code] = { key: 'zones.err.pacePair' }
        return
      }
      const pf = parsePace(pfRaw)
      const pt = parsePace(ptRaw)
      if (pf == null || pt == null) {
        errors[z.code] = { key: 'zones.err.paceFormat' }
        return
      }
      if (pf > pt) {
        errors[z.code] = { key: 'zones.err.paceOrder' }
        return
      }
      zone.pace_from = pf
      zone.pace_to = pt
    }
    zones[z.code] = zone
  })
  return { zones, errors }
}

// Avisos (no bloquean): zonas contiguas que se solapan o van desordenadas.
// Devuelve [{ key, params }].
export function manualZoneWarnings(zones) {
  const warnings = []
  const codes = HR_ZONES.map((z) => z.code).filter((c) => zones[c])
  for (let i = 1; i < codes.length; i += 1) {
    const prev = zones[codes[i - 1]]
    const cur = zones[codes[i]]
    if (cur.lo < prev.lo) warnings.push({ key: 'zones.warn.below', params: { cur: codes[i], prev: codes[i - 1] } })
    else if (cur.lo < prev.hi) warnings.push({ key: 'zones.warn.overlap', params: { prev: codes[i - 1], cur: codes[i], lo: cur.lo, hi: prev.hi } })
  }
  return warnings
}
