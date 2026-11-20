// El atleta puede escribir libremente el campo link_url (enlace a Strava,
// Garmin u otro). Antes de usarlo como href hay que comprobar que es un
// enlace http(s) real: cualquier otro esquema (javascript:, data:, etc.)
// se ejecutaría en la sesión de quien hace clic (típicamente el entrenador).
export function toSafeHref(value) {
  if (!value) return null
  try {
    const url = new URL(String(value).trim())
    if (url.protocol === 'http:' || url.protocol === 'https:') {
      return url.toString()
    }
  } catch {
    // URL inválida o relativa: se descarta, no se renderiza como enlace.
  }
  return null
}
