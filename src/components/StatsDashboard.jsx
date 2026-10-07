import { useMemo, useState } from 'react'
import ChartCard, { ChartEmpty, DataTable, KpiTile } from './charts/ChartCard'
import ColumnChart from './charts/ColumnChart'
import HBars from './charts/HBars'
import LineChart from './charts/LineChart'
import useToday from './calendar/useToday'
import { getLang, tr, useT } from '../i18n'
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

const loc = () => (getLang() === 'eu' ? 'eu-ES' : 'es-ES')
const fmtKm = (v) => new Intl.NumberFormat(loc(), { maximumFractionDigits: 1 }).format(Math.round(v * 10) / 10)
const fmtM = (v) => new Intl.NumberFormat(loc(), { maximumFractionDigits: 0 }).format(Math.round(v))
const fmtHours = (min) => new Intl.NumberFormat(loc(), { maximumFractionDigits: 1 }).format(Math.round((min / 60) * 10) / 10)

// Colores de las series de tiempo y desnivel: un solo tono (verde XR), claro =
// programado, oscuro = completado.
const DONE = 'var(--chart-done)'
const PLANNED = 'var(--chart-planned)'

// Dashboard "Estadísticas" del atleta. Tres métricas, cada una con gráfico,
// detalle y tabla de datos: km por disciplina, tiempo semanal y desnivel +.
export default function StatsDashboard({ sessions, disciplines }) {
  const t = useT()
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
        {t('stats.empty')}
      </ChartEmpty>
    )
  }

  const colorOf = (row) => disciplineColor(disciplines.find((d) => d.id === row.key) || null, disciplines)
  const kmRows = km.map((r) => ({ key: r.key, label: r.name, color: colorOf(r), total: r.planned, done: r.done }))
  const minRows = minutesDisc.map((r) => ({ key: r.key, label: r.name, color: colorOf(r), total: r.planned, done: r.done }))

  const weekData = weekly.map((w) => ({
    ...w,
    label: shortDate(w.weekStart),
    tooltipTitle: t('stats.weekOf', { from: shortDate(w.weekStart), to: shortDate(addDays(w.weekStart, 6)) }),
    current: w.weekStart === thisMonday,
  }))

  const cumDone = cumulative(weekly, 'doneElev')
  const cumPlanned = cumulative(weekly, 'plannedElev')

  return (
    <div className="space-y-6">
      {/* Filtro: una sola fila encima de todo; afecta a todo lo de abajo */}
      <div className="flex flex-wrap items-center gap-3">
        <div role="group" aria-label={t('stats.period')} className="inline-flex flex-wrap border border-mist rounded-sm bg-surface overflow-hidden">
          {RANGE_OPTIONS.map((o) => (
            <button
              key={o.key}
              type="button"
              onClick={() => setRangeKey(o.key)}
              aria-pressed={rangeKey === o.key}
              className={`px-3 py-2 text-sm transition-colors ${
                rangeKey === o.key ? 'bg-primary text-white font-semibold' : 'text-slate hover:bg-bg'
              }`}
            >
              {t('stats.range.' + o.key)}
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
          label={t('stats.kpi.km')}
          value={fmtKm(kmDone)}
          unit={t('stats.kpi.kmUnit')}
          detail={t('stats.kpi.kmDetail', { planned: fmtKm(kmPlanned), pct: kmPlanned > 0 ? ` (${Math.round((kmDone / kmPlanned) * 100)} %)` : '' })}
        />
        <KpiTile
          label={t('stats.kpi.time')}
          value={elapsed.length ? formatDuration(avgDoneMin) : '—'}
          unit={elapsed.length ? t('stats.kpi.timeUnit') : ''}
          detail={
            currentWeek
              ? t('stats.kpi.timeWeek', { done: formatDuration(currentWeek.doneMin), planned: formatDuration(currentWeek.plannedMin) })
              : t('stats.kpi.timeNone')
          }
        />
        <KpiTile
          label={t('stats.kpi.elev')}
          value={fmtM(elevDone)}
          unit={t('stats.kpi.elevUnit')}
          detail={t('stats.kpi.elevDetail', { planned: fmtM(elevPlanned), pct: elevPlanned > 0 ? ` (${Math.round((elevDone / elevPlanned) * 100)} %)` : '' })}
        />
      </div>

      {/* 1 · Kilómetros por disciplina */}
      <ChartCard
        title={t('stats.km.title')}
        subtitle={t('stats.km.subtitle')}
        table={
          kmRows.length > 0 && (
            <DataTable
              columns={[
                { key: 'name', label: t('stats.col.discipline') },
                { key: 'sessions', label: t('stats.col.sessions'), align: 'right' },
                { key: 'planned', label: t('stats.col.plannedKm'), align: 'right' },
                { key: 'done', label: t('stats.col.doneKm'), align: 'right' },
                { key: 'pct', label: t('stats.col.compliance'), align: 'right' },
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
                name: t('stats.total'),
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
          <ChartEmpty>{t('stats.km.empty')}</ChartEmpty>
        ) : (
          <>
            <HBars
              rows={kmRows}
              format={fmtKm}
              unitLabel=" km"
              ariaLabel={t('stats.km.aria')}
            />
            <p className="text-xs text-slate">
              {t('stats.km.note')}
            </p>
          </>
        )}
      </ChartCard>

      {/* 2 · Tiempo semanal */}
      <ChartCard
        title={t('stats.time.title')}
        subtitle={t('stats.time.subtitle')}
        table={
          weekData.length > 0 && (
            <DataTable
              columns={[
                { key: 'week', label: t('stats.col.week') },
                { key: 'planned', label: t('stats.col.planned'), align: 'right' },
                { key: 'done', label: t('stats.col.done'), align: 'right' },
                { key: 'sessions', label: t('stats.col.sessions'), align: 'right' },
              ]}
              rows={weekData.map((w) => ({
                key: w.weekStart,
                week: `${shortDate(w.weekStart)} – ${shortDate(addDays(w.weekStart, 6))}`,
                planned: formatDuration(w.plannedMin),
                done: formatDuration(w.doneMin),
                sessions: `${w.doneSessions}/${w.sessions}`,
              }))}
              footer={{
                week: t('stats.total'),
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
            {t('stats.time.empty')}
          </ChartEmpty>
        ) : (
          <>
            <ColumnChart
              data={weekData}
              series={[
                { key: 'plannedMin', label: t('stats.col.planned'), color: PLANNED },
                { key: 'doneMin', label: t('stats.col.done'), color: DONE },
              ]}
              format={formatDuration}
              axisFormat={(v) => `${fmtHours(v)} h`}
              axisUnit={60}
              ariaLabel={t('stats.time.aria')}
            />
            {minRows.length > 0 && (
              <div>
                <h4 className="font-mono text-xs text-slate mb-3">{t('stats.time.byDisc')}</h4>
                <HBars
                  rows={minRows}
                  format={(v) => fmtHours(v)}
                  unitLabel=" h"
                  ariaLabel={t('stats.time.byDiscAria')}
                />
              </div>
            )}
            {estimatedWeeks > 0 && (
              <p className="text-xs text-slate">
                {t('stats.time.estimated')}
              </p>
            )}
            {undatedCount > 0 && (
              <p className="text-xs text-slate">
                {t('stats.undated', { count: undatedCount })}
              </p>
            )}
          </>
        )}
      </ChartCard>

      {/* 3 · Desnivel positivo */}
      <ChartCard
        title={t('stats.elev.title')}
        subtitle={t('stats.elev.subtitle')}
        table={
          elevPlanned > 0 && (
            <DataTable
              columns={[
                { key: 'week', label: t('stats.col.week') },
                { key: 'planned', label: t('stats.col.plannedM'), align: 'right' },
                { key: 'done', label: t('stats.col.doneM'), align: 'right' },
                { key: 'accDone', label: t('stats.col.accM'), align: 'right' },
              ]}
              rows={weekData.map((w, i) => ({
                key: w.weekStart,
                week: `${shortDate(w.weekStart)} – ${shortDate(addDays(w.weekStart, 6))}`,
                planned: fmtM(w.plannedElev),
                done: fmtM(w.doneElev),
                accDone: fmtM(cumDone[i]),
              }))}
              footer={{ week: t('stats.total'), planned: fmtM(elevPlanned), done: fmtM(elevDone), accDone: fmtM(elevDone) }}
            />
          )
        }
      >
        {elevPlanned === 0 ? (
          <ChartEmpty>
            {t('stats.elev.empty')}
          </ChartEmpty>
        ) : (
          <>
            <LineChart
              labels={weekData.map((w) => w.label)}
              tooltipTitles={weekData.map((w) => w.tooltipTitle)}
              series={[
                { key: 'planned', label: t('stats.elev.series.planned'), color: PLANNED, values: cumPlanned },
                { key: 'done', label: t('stats.elev.series.done'), color: DONE, values: cumDone, area: true },
              ]}
              format={(v) => `${fmtM(v)} m`}
              ariaLabel={t('stats.elev.aria')}
            />
            {topElev.length > 0 && (
              <div>
                <h4 className="font-mono text-xs text-slate mb-2">{t('stats.elev.top')}</h4>
                <ul className="divide-y divide-mist border border-mist rounded-sm">
                  {topElev.map(({ s, elev }) => (
                    <li key={s.id} className="px-4 py-2.5 flex items-center justify-between gap-3 text-sm">
                      <span className="min-w-0">
                        <span className="font-semibold">{s.session_type || t('common.session')}</span>
                        <span className="text-slate"> · {s.session_date ? longDayTitle(s.session_date) : t('stats.elev.noDay')}</span>
                      </span>
                      <span className="font-mono text-xs whitespace-nowrap">
                        {fmtM(elev)} m
                        <span className="text-slate"> · {s.status === 'completado' ? t('stats.elev.done') : t('stats.elev.pending')}</span>
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
