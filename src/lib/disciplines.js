import { supabase } from '../supabaseClient'
import { tr } from '../i18n'

// El catálogo de disciplinas es pequeño y cambia poco (lo edita el
// entrenador desde Supabase), así que se pide una vez por pantalla en vez
// de añadir una dependencia de estado global.
export async function fetchDisciplines() {
  const { data, error } = await supabase
    .from('disciplines')
    .select('*')
    .eq('is_active', true)
    .order('name')
  if (error) {
    console.error('Error cargando disciplinas:', error.message)
    return []
  }
  return data || []
}

export function findDiscipline(disciplines, id) {
  return disciplines.find((d) => d.id === id) || null
}

// Nombre y etiquetas de campo traducidos. Si no hay traducción (disciplina
// creada a mano en la base de datos) se usa el texto guardado.
function localized(key, fallback) {
  const v = tr(key)
  return v === key ? fallback : v
}
export const disciplineName = (d) => (d ? localized(`disc.name.${d.code}`, d.name) : '')
export const fieldLabel = (f) => localized(`disc.field.${f.key}`, f.label)
// Nombre de la prueba del catálogo (5K, 10K, Media maratón, Maratón) en el idioma activo.
export const raceName = (r) => (!r ? '' : r.name === 'Media maratón' ? localized('race.half', r.name) : r.name === 'Maratón' ? localized('race.marathon', r.name) : r.name)
