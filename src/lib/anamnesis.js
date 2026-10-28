// Cuestionario de anamnesis: las 21 preguntas de la hoja "Anamnesis" del Excel
// del plan. Cada pregunta lleva el texto en castellano y el original en
// euskera, tal y como aparecen en el Excel. Las respuestas se guardan en la
// tabla `anamnesis` como un objeto { "1": "...", "2": "...", ... }.
//
// type: 'short' = una línea · 'long' = texto largo
export const ANAMNESIS_QUESTIONS = [
  { n: 1, es: 'Nombre y apellidos', eu: 'Izen-Abizenak', type: 'short' },
  { n: 2, es: 'Edad', eu: 'Adina', type: 'short' },
  { n: 3, es: 'Objetivo principal esta temporada', eu: 'Zein da zure helburu nagusia denboraldi honetan?', type: 'long' },
  { n: 4, es: 'Distancia o prueba en la que piensa competir a medio/largo plazo', eu: 'Zein distantzia edo probatan lehiatzeko asmoa duzu epe ertain/luzera?', type: 'short' },
  { n: 5, es: 'Tiempo corriendo de forma estructurada', eu: 'Zenbat denbora daramazu korrika egituratuta egiten?', type: 'short' },
  { n: 6, es: 'Marcas personales más destacadas', eu: 'Zeintzuk dira zure marka pertsonal aipagarrienak?', type: 'short' },
  { n: 7, es: 'Días de entrenamiento por semana en los últimos 3-6 meses', eu: 'Azken 3-6 hilabeteetako entrenamendu egunak/astean', type: 'short' },
  { n: 8, es: 'Kilometraje medio (km/semana)', eu: 'Batez besteko kilometrajea (km/astean)', type: 'short' },
  { n: 9, es: '¿Hace entrenamiento de fuerza?', eu: 'Indar-entrenamendurik egiten duzu?', type: 'short' },
  { n: 10, es: '¿Molestia, dolor o lesión actual?', eu: 'Baduzu gaur egun molestia, min edo lesiorik?', type: 'long' },
  { n: 11, es: '¿Lesión importante en los últimos 2 años que le impidiera correr?', eu: 'Izan al duzu azken bi urteetan korrika egitea eragotzi dizun lesio garrantzitsurik?', type: 'long' },
  { n: 12, es: 'Otros factores de salud a tener en cuenta', eu: 'Kontuan hartu beharreko bestelako osasun-faktorerik?', type: 'long' },
  { n: 13, es: 'Días por semana que puede dedicar a correr', eu: 'Astean zenbat egun eskaini diezazkiokezu korrikari?', type: 'short' },
  { n: 14, es: 'Días con más tiempo para sesiones largas', eu: 'Zein egunetan duzu denbora gehiago saio luzeetarako?', type: 'short' },
  { n: 15, es: 'Horario de trabajo/estudios y efecto en la fatiga', eu: 'Zein da zure lan/ikasketa ordutegia eta nola eragiten dio zure nekerai?', type: 'long' },
  { n: 16, es: 'Recursos disponibles para entrenar', eu: 'Zein baliabide dituzu eskura entrenatzeko?', type: 'short' },
  { n: 17, es: 'Reloj o dispositivo que usa', eu: 'Zein erloju edo gailu erabiltzen duzu?', type: 'short' },
  { n: 18, es: '¿Cuenta de Strava o Garmin Connect?', eu: 'Strava edo Garmin Connect konturik baduzu?', type: 'short' },
  { n: 19, es: 'Cómo entrena normalmente', eu: 'Nola entrenatzen duzu normalean?', type: 'short' },
  { n: 20, es: '¿Conoce el método RPE (escala de esfuerzo 1-10)?', eu: 'Ezagutzen al duzu RPE (Ahalegin Pertzepzioaren Eskala 1etik 10era) metodoa?', type: 'short' },
  { n: 21, es: 'Otras notas o información adicional para el entrenador', eu: 'Bestelako oharrak edo entrenatzaileari helarazi nahi diozun informazio plusa', type: 'long' },
]

// ---------------------------------------------------------------------------
// De la anamnesis al perfil: al guardar el cuestionario se rellenan solos los
// campos del perfil del atleta (tabla athlete_profiles) y su nombre y edad.
// Solo se tocan los campos cuyas preguntas tienen respuesta.
// ---------------------------------------------------------------------------

// Etiqueta corta de cada pregunta cuando se agrupan varias en un mismo campo.
const SHORT = {
  5: { es: 'Tiempo corriendo', eu: 'Korrikan daraman denbora' },
  7: { es: 'Días de entreno/semana', eu: 'Entrenamendu egunak/astean' },
  8: { es: 'Km/semana', eu: 'Km/astean' },
  10: { es: 'Molestia actual', eu: 'Egungo molestia' },
  11: { es: 'Lesión en los últimos 2 años', eu: 'Azken 2 urteetako lesioa' },
  12: { es: 'Otros factores de salud', eu: 'Bestelako osasun-faktoreak' },
  13: { es: 'Días disponibles para correr', eu: 'Korrika egiteko egun eskuragarriak' },
  14: { es: 'Días para tiradas largas', eu: 'Saio luzeetarako egunak' },
  15: { es: 'Trabajo/estudios y fatiga', eu: 'Lana/ikasketak eta nekea' },
  16: { es: 'Recursos', eu: 'Baliabideak' },
  17: { es: 'Reloj o dispositivo', eu: 'Erlojua edo gailua' },
  18: { es: 'Strava / Garmin', eu: 'Strava / Garmin' },
  19: { es: 'Cómo entrena', eu: 'Nola entrenatzen duen' },
  20: { es: 'Conoce el RPE', eu: 'RPE ezagutzen du' },
}

// campo del perfil -> preguntas que lo alimentan (en este orden)
export const PROFILE_FIELD_SOURCES = {
  main_goal: [3],
  long_term_goal: [4],
  sport_history: [5, 7, 8],
  personal_bests: [6],
  weekly_run_frequency: [13, 14],
  weekly_strength_frequency: [9],
  injury_history: [10, 11, 12],
  resources: [16, 17, 18],
  load_control: [15, 19, 20],
  notes: [21],
}

const clean = (v) => String(v ?? '').trim()

// answers = { "1": "...", "3": "...", ... } · lang = 'es' | 'eu'
// Devuelve { profile, basic }: los campos de athlete_profiles y de profiles
// (full_name, age) que se pueden rellenar con lo respondido.
export function profileFromAnamnesis(answers, lang = 'es') {
  const l = lang === 'eu' ? 'eu' : 'es'
  const a = answers || {}
  const profile = {}
  Object.entries(PROFILE_FIELD_SOURCES).forEach(([field, nums]) => {
    const answered = nums.filter((n) => clean(a[n]) !== '')
    if (answered.length === 0) return
    // Un solo origen sin etiqueta -> texto tal cual; varios -> «Etiqueta: respuesta» por línea.
    profile[field] =
      nums.length === 1
        ? clean(a[nums[0]])
        : answered.map((n) => `${SHORT[n]?.[l] ?? n}: ${clean(a[n])}`).join('\n')
  })
  const basic = {}
  if (clean(a[1]) !== '') basic.full_name = clean(a[1])
  const age = clean(a[2]).match(/\d{1,3}/)
  if (age && Number(age[0]) >= 5 && Number(age[0]) <= 110) basic.age = Number(age[0])
  return { profile, basic }
}
