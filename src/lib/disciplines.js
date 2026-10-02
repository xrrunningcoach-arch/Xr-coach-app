import { supabase } from '../supabaseClient'

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
