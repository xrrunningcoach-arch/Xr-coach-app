// Tarjeta de un gráfico: título, descripción, contenido y, opcionalmente, la
// vista en tabla (siempre disponible: los gráficos nunca son la única vía).
export default function ChartCard({ title, subtitle, right, children, table }) {
  return (
    <section className="bg-white border border-mist rounded-sm overflow-hidden">
      <div className="px-5 py-3 bg-bg-dim flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="font-display text-lg text-navy">{title}</h3>
          {subtitle && <p className="font-mono text-[11px] text-slate">{subtitle}</p>}
        </div>
        {right}
      </div>
      <div className="p-5 space-y-4">{children}</div>
      {table && (
        <details className="border-t border-mist group">
          <summary className="px-5 py-3 text-sm font-semibold text-navy cursor-pointer select-none hover:text-red list-none flex items-center gap-2">
            <span className="font-mono text-xs text-slate group-open:rotate-90 transition-transform inline-block">▸</span>
            Ver datos en tabla
          </summary>
          <div className="px-5 pb-5 overflow-x-auto">{table}</div>
        </details>
      )}
    </section>
  )
}

export function DataTable({ columns, rows, footer }) {
  return (
    <table className="w-full text-sm min-w-[420px]">
      <thead>
        <tr className="text-left">
          {columns.map((c) => (
            <th key={c.key} className={`py-2 pr-4 font-mono text-xs text-slate font-normal ${c.align === 'right' ? 'text-right' : ''}`}>
              {c.label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody className="divide-y divide-mist">
        {rows.map((r, i) => (
          <tr key={r.key ?? i}>
            {columns.map((c) => (
              <td key={c.key} className={`py-2 pr-4 ${c.align === 'right' ? 'text-right font-mono' : ''} ${c.muted ? 'text-slate' : ''}`}>
                {r[c.key]}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
      {footer && (
        <tfoot>
          <tr className="border-t border-mist font-semibold">
            {columns.map((c) => (
              <td key={c.key} className={`py-2 pr-4 ${c.align === 'right' ? 'text-right font-mono' : ''}`}>
                {footer[c.key]}
              </td>
            ))}
          </tr>
        </tfoot>
      )}
    </table>
  )
}

export function KpiTile({ label, value, unit, detail }) {
  return (
    <div className="bg-white border border-mist rounded-sm p-5">
      <p className="font-mono text-[11px] uppercase text-navy-light">{label}</p>
      <p className="mt-1 flex items-baseline gap-1.5">
        <span className="font-display text-3xl text-navy">{value}</span>
        {unit && <span className="text-sm text-slate">{unit}</span>}
      </p>
      {detail && <p className="mt-1 text-xs text-slate">{detail}</p>}
    </div>
  )
}

export function ChartEmpty({ children }) {
  return <p className="text-sm text-slate bg-bg rounded-sm px-4 py-6 text-center">{children}</p>
}
