import { useMemo, useState } from 'react'
import ChartCard, { ChartEmpty, DataTable, KpiTile } from './charts/ChartCard'
import ColumnChart from './charts/ColumnChart'
import HBars from './charts/HBars'
import LineChart from './charts/LineChart'
import useToday from './calendar/useToday'
import { disciplineColor } from '../lib/disciplineColors'
import { addDays, mondayOf, shortDate, longDayTitle } from '../lib/dates'
import {
  RANGE_OPTIONS,
  cumulative,
  formatDuration,
  inWindow,
  kmByDiscipline,
  minutesByDiscipline,
  resolveWindow,
  sessionElevation,
  sum,
  topElevationSessions,
  weeklySeries,
} from '../lib/stats'

const nf = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 1 })
const nf0 = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 0 })
const fmtKm = (v) => nf.format(Math.round(v * 10) / 10)
const fmtM = (v) => nf0.format(Math.round(v))
const fmtHours = (min) => nf.format(Math.round((min / 60) * 10) / 10)

// Colores de las series de tiempo y desnivel: un solo tono (verde XR), claro =
// programado, oscuro = completado.
const DONE = '#25534b'
const PLANNED = '#a9c7bb'

// Dashboard "Estadísticas" del atleta. Tres métricas, cada una con gráfico,
// detalle y tabla de datos: km por disciplina, tiempo semanal y desnivel +.
export default function StatsDashboard({ sessions, disciplines }) {
  const today = useToday()
  const [rangeKey, setRangeKey] = useState('plan')

  const win = useMemo(() => resolveWindow(rangeKey, today), [rangeKey, today])
  const scoped = useMemo(() => sessions.filter((s) => inWindow(s, win)), [sessions, win])

  const km = useMemo(() => kmByDiscipline(scoped, disciplines), [scoped, disciplines])
  const minutesDisc = useMemo(() => minutesByDiscipline(scoped, disciplines), [scoped, disciplines])
  const weekly = useMemo(() => weeklySeries(scoped, win), [scoped, win])

  const thisMonday = mondayOf(today)
  const kmDone = km.reduce((t, r) => t + r.done, 0)
  const kmPlanned = km.reduce((t, r) => t + r.planned, 0)

  const elapsed = weekly.filter((w) => w.weekStart <= thisMonday)
  const doneTotalMin = sum(elapsed, 'doneMin')
  const avgDoneMin = elapsed.length ? doneTotalMin / elapsed.length : 0
  const currentWeek = weekly.find((w) => w.weekStart === thisMonday)

  const elevDone = sum(weekly, 'doneElev')
  const elevPlanned = sum(weekly, 'plannedElev')
  const topElev = topElevationSessions(scoped, 5)

  const undatedCount = rangeKey === 'plan' ? sessions.filter((s) => !s.session_date).length : 0
  const estimatedWeeks = weekly.filter((w) => w.estimatedMin > 0).length
  const hasAny = sessions.length > 0

  if (!hasAny) {
    return (
      <ChartEmpty>
        Todavía no hay sesiones en tu plan. Cuando tu entrenador las programe, aquí verás tus kilómetros, tu tiempo de entrenamiento y tu desnivel.
      </ChartEmpty>
    )
  }

  const colorOf = (row) => disciplineColor(disciplines.find((d) => d.id === row.key) || null, disciplines)
  const kmRows = km.map((r) => ({ key: r.key, label: r.name, color: colorOf(r), total: r.planned, done: r.done }))
  const minRows = minutesDisc.map((r) => ({ key: r.key, label: r.name, color: colorOf(r), total: r.planned, done: r.done }))

  const weekData = weekly.map((w) => ({
    ...w,
    label: shortDate(w.weekStart),
    tooltipTitle: `Semana del ${shortDate(w.weekStart)} al ${shortDate(addDays(w.weekStart, 6))}`,
    current: w.weekStart === thisMonday,
  }))

  const cumDone = cumulative(weekly, 'doneElev')
  const cumPlanned = cumulative(weekly, 'plannedElev')

  return (
    <div className="space-y-6">
      {/* Filtro: una sola fila encima de todo; afecta a todo lo de abajo */}
      <div className="flex flex-wrap items-center gap-3">
        <div role="group" aria-label="Periodo" className="inline-flex flex-wrap border border-mist rounded-sm bg-white overflow-hidden">
          {RANGE_OPTIONS.map((o) => (
            <button
              key={o.key}
              type="button"
              onClick={() => setRangeKey(o.key)}
              aria-pressed={rangeKey === o.key}
              className={`px-3 py-2 text-sm transition-colors ${
                rangeKey === o.key ? 'bg-navy text-white font-semibold' : 'text-slate hover:bg-bg'
              }`}
            >
              {o.label}
            </button>
          ))}
        </div>
        {win && (
          <span className="font-mono text-[11px] text-slate">
            {shortDate(win.from)} – {shortDate(win.to)}
          </span>
        )}
      </div>

      {/* Las tres métricas de un vistazo */}
      <div className="grid sm:grid-cols-3 gap-4">
        <KpiTile
          label="Kilómetros acumulados"
          value={fmtKm(kmDone)}
          unit="km completados"
          detail={`de ${fmtKm(kmPlanned)} km programados${kmPlanned > 0 ? ` (${Math.round((kmDone / kmPlanned) * 100)} %)` : ''}`}
        />
        <KpiTile
          label="Tiempo semanal"
          value={elapsed.length ? formatDuration(avgDoneMin) : '—'}
          unit={elapsed.length ? 'de media por semana' : ''}
          detail={
            currentWeek
              ? `Esta semana: ${formatDuration(currentWeek.doneMin)} de ${formatDuration(currentWeek.plannedMin)} previstos`
              : 'Esta semana no tiene sesiones en este periodo'
          }
        />
        <KpiTile
          label="Desnivel positivo acumulado"
          value={fmtM(elevDone)}
          unit="m completados"
          detail={`de ${fmtM(elevPlanned)} m programados${elevPlanned > 0 ? ` (${Math.round((elevDone / elevPlanned) * 100)} %)` : ''}`}
        />
      </div>

      {/* 1 · Kilómetros por disciplina */}
      <ChartCard
        title="Kilómetros acumulados por disciplina"
        subtitle="Completados frente a programados · según los km de cada sesión"
        table={
          kmRows.length > 0 && (
            <DataTable
              columns={[
                { key: 'name', label: 'Disciplina' },
                { key: 'sessions', label: 'Sesiones', align: 'right' },
                { key: 'planned', label: 'Programados (km)', align: 'right' },
                { key: 'done', label: 'Completados (km)', align: 'right' },
                { key: 'pct', label: 'Cumplimiento', align: 'right' },
              ]}
              rows={km.map((r) => ({
                key: r.key,
                name: r.name,
                sessions: `${r.doneCount}/${r.count}`,
                planned: fmtKm(r.planned),
                done: fmtKm(r.done),
                pct: r.planned > 0 ? `${Math.round((r.done / r.planned) * 100)} %` : '—',
              }))}
              footer={{
                name: 'Total',
                sessions: `${km.reduce((t, r) => t + r.doneCount, 0)}/${km.reduce((t, r) => t + r.count, 0)}`,
                planned: fmtKm(kmPlanned),
                done: fmtKm(kmDone),
                pct: kmPlanned > 0 ? `${Math.round((kmDone / kmPlanned) * 100)} %` : '—',
              }}
            />
          )
        }
      >
        {kmRows.length === 0 ? (
          <ChartEmpty>No hay kilómetros programados en este periodo.</ChartEmpty>
        ) : (
          <>
            <HBars
              rows={kmRows}
              format={fmtKm}
              unitLabel=" km"
              ariaLabel="Kilómetros completados y programados por disciplina"
            />
            <p className="text-xs text-slate">
              Los kilómetros son los que figuran en cada sesión (km estimados o, en bici y natación, su distancia). Cuentan como completados las sesiones que has marcado como «Completado».
            </p>
          </>
        )}
      </ChartCard>

      {/* 2 · Tiempo semanal */}
      <ChartCard
        title="Tiempo total de entrenamiento semanal"
        subtitle="Horas por semana natural (lunes a domingo)"
        table={
          weekData.length > 0 && (
            <DataTable
              columns={[
                { key: 'week', label: 'Semana' },
                { key: 'planned', label: 'Previsto', align: 'right' },
                { key: 'done', label: 'Hecho', align: 'right' },
                { key: 'sessions', label: 'Sesiones', align: 'right' },
              ]}
              rows={weekData.map((w) => ({
                key: w.weekStart,
                week: `${shortDate(w.weekStart)} – ${shortDate(addDays(w.weekStart, 6))}`,
                planned: formatDuration(w.plannedMin),
                done: formatDuration(w.doneMin),
                sessions: `${w.doneSessions}/${w.sessions}`,
              }))}
              footer={{
                week: 'Total',
                planned: formatDuration(sum(weekData, 'plannedMin')),
                done: formatDuration(sum(weekData, 'doneMin')),
                sessions: `${sum(weekData, 'doneSessions')}/${sum(weekData, 'sessions')}`,
              }}
            />
          )
        }
      >
        {sum(weekData, 'plannedMin') + sum(weekData, 'doneMin') === 0 ? (
          <ChartEmpty>
            Las sesiones de este periodo aún no tienen duración. Aparecerá cuando tu entrenador indique la duración prevista o tú registres la real.
          </ChartEmpty>
        ) : (
          <>
            <ColumnChart
              data={weekData}
              series={[
                { key: 'plannedMin', label: 'Previsto', color: PLANNED },
                { key: 'doneMin', label: 'Hecho', color: DONE },
              ]}
              format={formatDuration}
              axisFormat={(v) => `${fmtHours(v)} h`}
              axisUnit={60}
              ariaLabel="Tiempo de entrenamiento previsto y realizado por semana"
            />
            {minRows.length > 0 && (
              <div>
                <h4 className="font-mono text-xs text-slate mb-3">Reparto por disciplina (hecho / previsto)</h4>
                <HBars
                  rows={minRows}
                  format={(v) => fmtHours(v)}
                  unitLabel=" h"
                  ariaLabel="Horas completadas y previstas por disciplina"
                />
              </div>
            )}
            {estimatedWeeks > 0 && (
              <p className="text-xs text-slate">
                En algunas sesiones completadas no hay duración real registrada: se cuenta la duración prevista.
              </p>
            )}
            {undatedCount > 0 && (
              <p className="text-xs text-slate">
                {undatedCount} {undatedCount === 1 ? 'sesión sin día asignado no aparece' : 'sesiones sin día asignado no aparecen'} en las gráficas semanales.
              </p>
            )}
          </>
        )}
      </ChartCard>

      {/* 3 · Desnivel positivo */}
      <ChartCard
        title="Desnivel positivo acumulado"
        subtitle="Metros de subida acumulados semana a semana"
        table={
          elevPlanned > 0 && (
            <DataTable
              columns={[
                { key: 'week', label: 'Semana' },
                { key: 'planned', label: 'Programado (m)', align: 'right' },
                { key: 'done', label: 'Completado (m)', align: 'right' },
                { key: 'accDone', label: 'Acumulado (m)', align: 'right' },
              ]}
              rows={weekData.map((w, i) => ({
                key: w.weekStart,
                week: `${shortDate(w.weekStart)} – ${shortDate(addDays(w.weekStart, 6))}`,
                planned: fmtM(w.plannedElev),
                done: fmtM(w.doneElev),
                accDone: fmtM(cumDone[i]),
              }))}
              footer={{ week: 'Total', planned: fmtM(elevPlanned), done: fmtM(elevDone), accDone: fmtM(elevDone) }}
            />
          )
        }
      >
        {elevPlanned === 0 ? (
          <ChartEmpty>
            Ninguna sesión de este periodo tiene desnivel. Se calcula con el campo «Desnivel (m)» de las sesiones de carrera.
          </ChartEmpty>
        ) : (
          <>
            <LineChart
              labels={weekData.map((w) => w.label)}
              tooltipTitles={weekData.map((w) => w.tooltipTitle)}
              series={[
                { key: 'planned', label: 'Programado', color: PLANNED, values: cumPlanned },
                { key: 'done', label: 'Completado', color: DONE, values: cumDone, area: true },
              ]}
              format={(v) => `${fmtM(v)} m`}
              ariaLabel="Desnivel positivo acumulado, programado y completado, por semana"
            />
            {topElev.length > 0 && (
              <div>
                <h4 className="font-mono text-xs text-slate mb-2">Sesiones con más desnivel</h4>
                <ul className="divide-y divide-mist border border-mist rounded-sm">
                  {topElev.map(({ s, elev }) => (
                    <li key={s.id} className="px-4 py-2.5 flex items-center justify-between gap-3 text-sm">
                      <span className="min-w-0">
                        <span className="font-semibold">{s.session_type || 'Sesión'}</span>
                        <span className="text-slate"> · {s.session_date ? longDayTitle(s.session_date) : 'sin día asignado'}</span>
                      </span>
                      <span className="font-mono text-xs whitespace-nowrap">
                        {fmtM(elev)} m
                        <span className="text-slate"> · {s.status === 'completado' ? 'completada' : 'pendiente'}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
      </ChartCard>
    </div>
  )
}
