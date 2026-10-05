import { useEffect, useState } from 'react'
import { msUntilNextMidnight, todayISO } from '../../lib/dates'

// Devuelve la fecha de hoy y se actualiza sola: a medianoche y cuando la
// pestaña vuelve a estar visible (portátil que estuvo dormido, etc.). Así el
// calendario "avanza" con el reloj sin recargar la página.
export default function useToday() {
  const [today, setToday] = useState(() => todayISO())

  useEffect(() => {
    let timer
    const sync = () => {
      setToday((prev) => {
        const now = todayISO()
        return now === prev ? prev : now
      })
    }
    const schedule = () => {
      clearTimeout(timer)
      timer = setTimeout(() => {
        sync()
        schedule()
      }, msUntilNextMidnight())
    }
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        sync()
        schedule()
      }
    }
    schedule()
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', sync)
    return () => {
      clearTimeout(timer)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', sync)
    }
  }, [])

  return today
}
