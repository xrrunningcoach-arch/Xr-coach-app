// Genera el ESQUELETO de un plan (mesociclos + filas de sesión vacías) a partir
// únicamente del número de semanas. El contenido real de cada entrenamiento
// (descripción, km, RPE teórico) lo rellena después el entrenador desde la
// pantalla del plan — igual que en el Excel, aquí solo se crea la estructura.
//
// Reparto por defecto (igual que la plantilla de 11 semanas a 5K):
//   Mesociclo 1 · Base aeróbica        ~40% de las semanas
//   Mesociclo 2 · Desarrollo específico ~40% de las semanas
//   Mesociclo 3 · Afinado y competición ~20% de las semanas (mínimo 2)
//
// Cada semana lleva 3 sesiones por defecto (Día 1/2/3, como en la plantilla),
// pero el entrenador puede añadir o quitar filas libremente en la web.

export const SESSION_TYPES_SUGGESTED = [
  'Rodaje Suave',
  'Rodaje Progresivo',
  'Rodaje Variable',
  'Rodaje Largo',
  'Series / Intervalos',
  'Rodaje + Cuestas/Sprints',
  'Activación Pre-Carrera',
  'Día de Carrera',
  'Descanso',
]

// Tipos de sesión sugeridos (lista desplegable) en el idioma activo.
// t = función de traducción; sin ella devuelve la lista en castellano.
const SESSION_TYPE_KEYS = ['easy', 'progressive', 'variable', 'long', 'intervals', 'hills', 'activation', 'race', 'rest']
export function suggestedSessionTypes(t) {
  return t ? SESSION_TYPE_KEYS.map((k) => t(`st.${k}`)) : SESSION_TYPES_SUGGESTED
}

// t = función de traducción (opcional): con ella los nombres, enfoques y objetivos de los
// mesociclos y de la sesión de carrera se generan en el idioma activo.
export function generatePlanSkeleton(totalWeeks, sessionsPerWeek = 3, t = null) {
  const tx = (key, fallback) => (t ? t(key) : fallback)
  const weeks = Math.max(1, Math.round(totalWeeks))

  const meso3Weeks = Math.min(weeks, Math.max(2, Math.round(weeks * 0.2)))
  const remaining = weeks - meso3Weeks
  const meso1Weeks = remaining > 0 ? Math.max(1, Math.round(remaining * 0.5)) : 0
  const meso2Weeks = Math.max(0, remaining - meso1Weeks)

  const mesocycles = []
  let cursor = 1

  if (meso1Weeks > 0) {
    mesocycles.push({
      order_index: 1,
      name: tx('pg.m1.name', 'Mesociclo 1 · Base Aeróbica'),
      week_start: cursor,
      week_end: cursor + meso1Weeks - 1,
      focus: tx('pg.m1.focus', 'Adaptación aeróbica y construcción de base'),
      key_objective: tx('pg.m1.obj', 'Establecer volumen y consolidar la técnica de carrera'),
    })
    cursor += meso1Weeks
  }

  if (meso2Weeks > 0) {
    mesocycles.push({
      order_index: mesocycles.length + 1,
      name: tx('pg.m2.name', 'Mesociclo 2 · Desarrollo Específico'),
      week_start: cursor,
      week_end: cursor + meso2Weeks - 1,
      focus: tx('pg.m2.focus', 'Series de calidad al ritmo objetivo y resistencia al ritmo'),
      key_objective: tx('pg.m2.obj', 'Consolidar la velocidad específica de la prueba'),
    })
    cursor += meso2Weeks
  }

  mesocycles.push({
    order_index: mesocycles.length + 1,
    name: tx('pg.m3.name', 'Mesociclo 3 · Afinado y Competición'),
    week_start: cursor,
    week_end: cursor + meso3Weeks - 1,
    focus: tx('pg.m3.focus', 'Reducción de volumen, mantenimiento de intensidad'),
    key_objective: tx('pg.m3.obj', 'Llegar fresco y afilado al día de la prueba'),
  })

  const sessions = []
  for (let week = 1; week <= weeks; week++) {
    const meso = mesocycles.find((m) => week >= m.week_start && week <= m.week_end)
    for (let day = 1; day <= sessionsPerWeek; day++) {
      const isRaceDay = week === weeks && day === sessionsPerWeek
      sessions.push({
        week_number: week,
        day_number: day,
        mesocycle_order: meso ? meso.order_index : null,
        session_type: isRaceDay ? tx('st.race', 'Día de Carrera') : '',
        description: isRaceDay ? tx('pg.raceDesc', 'Por definir — día de la prueba objetivo') : '',
        km_estimated: null,
        rpe_theoretical: '',
        status: 'pendiente',
      })
    }
  }

  return { mesocycles, sessions }
}
