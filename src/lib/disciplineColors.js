// Color fijo por disciplina (identidad), la misma en calendario y estadísticas.
// Es la paleta categórica validada (orden fijo, no cíclico). Las disciplinas
// que no estén en la lista usan los últimos huecos y, pasados estos, un gris.
const SLOTS = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#4a3aa7', '#e34948']
const BY_CODE = { running: 0, swim: 1, strength: 2, bike: 3, hyrox: 4, mobility: 5 }
export const NEUTRAL_COLOR = '#898781'

export function disciplineColor(discipline, allDisciplines = []) {
  if (!discipline) return NEUTRAL_COLOR
  if (discipline.code in BY_CODE) return SLOTS[BY_CODE[discipline.code]]
  const unknown = allDisciplines
    .filter((d) => !(d.code in BY_CODE))
    .sort((a, b) => String(a.code).localeCompare(String(b.code)))
  const idx = unknown.findIndex((d) => d.id === discipline.id)
  return idx >= 0 && 6 + idx < SLOTS.length ? SLOTS[6 + idx] : NEUTRAL_COLOR
}
