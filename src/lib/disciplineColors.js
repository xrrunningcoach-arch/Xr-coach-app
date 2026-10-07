// Color fijo por disciplina (identidad), la misma en calendario y estadísticas.
// Es la paleta categórica validada (orden fijo, no cíclico). Las disciplinas
// que no estén en la lista usan los últimos huecos y, pasados estos, un gris.
// Los colores viven en variables CSS (--d1..--d8) para que cambien con el tema claro/oscuro.
const SLOTS = ['var(--d1)', 'var(--d2)', 'var(--d3)', 'var(--d4)', 'var(--d5)', 'var(--d6)', 'var(--d7)', 'var(--d8)']
const BY_CODE = { running: 0, swim: 1, strength: 2, bike: 3, hyrox: 4, mobility: 5 }
export const NEUTRAL_COLOR = 'var(--d-neutral)'

export function disciplineColor(discipline, allDisciplines = []) {
  if (!discipline) return NEUTRAL_COLOR
  if (discipline.code in BY_CODE) return SLOTS[BY_CODE[discipline.code]]
  const unknown = allDisciplines
    .filter((d) => !(d.code in BY_CODE))
    .sort((a, b) => String(a.code).localeCompare(String(b.code)))
  const idx = unknown.findIndex((d) => d.id === discipline.id)
  return idx >= 0 && 6 + idx < SLOTS.length ? SLOTS[6 + idx] : NEUTRAL_COLOR
}
