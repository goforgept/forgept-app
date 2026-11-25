import { useMemo, useState } from 'react'
import { useDash } from '../context'
import { Card, Empty, Donut, LegendRow, Row, Eyebrow, Chip } from '../ui'
import { money, money2, moneyShort, plural, daysUntil, shortDate, laborDollars, laborHours, closingWithin, periodStart, C, DAY } from '../util'

// ── Invoicing & AR ───────────────────────────────────────────────────────────
export function Receivables() {
  const { data, go } = useDash()
  const invoices = data.invoices || []
  const openInv = invoices.filter(i => i.status === 'Sent' || i.status === 'Partial')
  const overdueInv = openInv.filter(i => i.due_date && new Date(i.due_date) < new Date())
  const outstanding = openInv.reduce((s, i) => s + (i.balance_due || 0), 0)
  const overdue = overdueInv.reduce((s, i) => s + (i.balance_due || 0), 0)
  const invoiced = invoices.reduce((s, i) => s + (i.total || 0), 0)
  const invoicedIds = new Set(invoices.map(i => i.proposal_id))
  const needsInvoice = (data.proposals || []).filter(p => p.status === 'Won' && !invoicedIds.has(p.id)).length
  const segs = [
    { key: 'current', label: 'Not yet due', value: outstanding - overdue, color: C.blue },
    { key: 'overdue', label: 'Overdue', value: overdue, color: C.red },
  ]
  return (
    <Card title="Invoicing & AR" action={{ label: 'Invoices', onClick: () => go('/invoices') }}>
      <div className="flex items-center gap-5 flex-wrap">
        <div className="mx-auto">
          <Donut size={132} thickness={18} segments={segs} ariaLabel={`Outstanding ${money(outstanding)}, overdue ${money(overdue)}`}
            center={<div><p className="text-fp-text text-base font-bold tabular-nums">{moneyShort(outstanding)}</p><p className="text-fp-muted text-[11px]">outstanding</p></div>} />
        </div>
        <div className="flex-1 min-w-[190px]">
          <LegendRow color={C.blue} label="Not yet due" meta={plural(openInv.length - overdueInv.length, 'invoice')} value={money(outstanding - overdue)} />
          <LegendRow color={C.red} label="Overdue" meta={plural(overdueInv.length, 'invoice')} value={money(overdue)} />
          <div className="grid grid-cols-2 gap-3 pt-3 mt-1 border-t border-fp-border/60">
            <div><Eyebrow>Invoiced</Eyebrow><p className="text-fp-text text-sm font-semibold tabular-nums mt-0.5">{money(invoiced)}</p></div>
            <button onClick={() => go('/proposals?status=Won')} className="text-left">
              <Eyebrow>Needs invoice</Eyebrow>
              <p className={`text-sm font-semibold tabular-nums mt-0.5 ${needsInvoice ? 'text-amber-500' : 'text-fp-text'}`}>{plural(needsInvoice, 'won deal')}</p>
            </button>
          </div>
        </div>
      </div>
    </Card>
  )
}

// ── Purchase orders / materials ──────────────────────────────────────────────
export function Materials() {
  const { data, go } = useDash()
  const pos = data.purchaseOrders || []
  const by = (s) => pos.filter(p => p.status === s)
  const segs = [
    { key: 'Sent', label: 'On order', value: by('Sent').length, color: C.blue },
    { key: 'Partial', label: 'Partly received', value: by('Partial').length, color: C.amber },
    { key: 'Received', label: 'Received', value: by('Received').length, color: C.green },
  ]
  const outstanding = pos.filter(p => p.status === 'Sent' || p.status === 'Partial')
  const totalValue = pos.reduce((s, p) => s + (p.total_amount || 0), 0)
  return (
    <Card title="Purchase orders" sub={`${plural(pos.length, 'PO')} · ${money(totalValue)}`} action={{ label: 'All POs', onClick: () => go('/purchase-orders') }}>
      {pos.length === 0 ? <Empty>No purchase orders yet.</Empty> : (
        <>
          <div className="flex items-center gap-5 flex-wrap">
            <div className="mx-auto">
              <Donut size={120} thickness={18} segments={segs} ariaLabel={segs.map(s => `${s.label} ${s.value}`).join(', ')}
                center={<div><p className="text-fp-text text-lg font-bold tabular-nums">{outstanding.length}</p><p className="text-fp-muted text-[11px]">open</p></div>} />
            </div>
            <div className="flex-1 min-w-[170px]">
              {segs.map(s => <LegendRow key={s.key} color={s.color} label={s.label} meta="" value={s.value} />)}
            </div>
          </div>
          {outstanding.length > 0 && (
            <div className="flex flex-col">
              {outstanding.slice(0, 5).map(po => (
                <Row key={po.id} onClick={() => go('/purchase-orders')} title={<span className="font-mono">{po.po_number || 'PO'}</span>} sub={po.vendor_name}
                  right={<><span className="block text-fp-text text-sm font-semibold tabular-nums">{money(po.total_amount)}</span><Chip color={po.status === 'Partial' ? C.amber : C.blue}>{po.status === 'Partial' ? 'Partial' : 'On order'}</Chip></>} />
              ))}
            </div>
          )}
        </>
      )}
    </Card>
  )
}

// ── Recurring revenue & renewals ─────────────────────────────────────────────
function groupByClient(items) {
  const g = new Map()
  items.forEach(it => {
    const k = it.proposals?.client_id || it.proposals?.company || 'unknown'
    if (!g.has(k)) g.set(k, { clientId: it.proposals?.client_id, company: it.proposals?.company || 'Unknown', repName: it.proposals?.rep_name, proposalName: it.proposals?.proposal_name, items: [], total: 0, earliest: it.renewal_date })
    const r = g.get(k)
    r.items.push(it); r.total += it.customer_price_total || 0
    if (it.renewal_date < r.earliest) r.earliest = it.renewal_date
  })
  return [...g.values()]
}

export function Recurring() {
  const { data, period, periodShort, isTeam, go } = useDash()
  const [modal, setModal] = useState(null)
  const items = data.recurring || []
  const stats = useMemo(() => {
    const today = new Date(), in90 = new Date(Date.now() + 90 * DAY)
    const start = periodStart(period)
    const end = period === 'mtd' ? new Date(today.getFullYear(), today.getMonth() + 1, 0)
      : period === 'qtd' ? new Date(today.getFullYear(), Math.floor(today.getMonth() / 3) * 3 + 3, 0)
      : period === 'ytd' ? new Date(today.getFullYear(), 11, 31) : in90
    const inPeriod = period === 'all' ? items : items.filter(i => { const d = new Date(i.renewal_date); return d >= (start || today) && d <= end })
    const upcoming = items.filter(i => { const d = new Date(i.renewal_date); return d >= today && d <= in90 })
    return {
      inPeriod, upcoming,
      revenue: inPeriod.reduce((s, i) => s + (i.customer_price_total || 0), 0),
      upcomingGroups: groupByClient(upcoming).sort((a, b) => new Date(a.earliest) - new Date(b.earliest)),
    }
  }, [items, period])
  if (items.length === 0) return null

  const tiles = [
    { key: 'revenue', label: `Recurring revenue${periodShort ? ` · ${periodShort}` : ''}`, value: money2(stats.revenue), sub: `${plural(stats.inPeriod.length, 'item')} renewing` },
    { key: 'quoting', label: 'Renewals in 90 days', value: stats.upcoming.length, sub: `across ${plural(stats.upcomingGroups.length, 'client')}`, warn: stats.upcoming.length > 0 },
    { key: 'all', label: 'Recurring items', value: items.length, sub: 'across won deals' },
  ]
  const modalGroups = modal === 'revenue' ? groupByClient(stats.inPeriod).sort((a, b) => b.total - a.total)
    : modal === 'quoting' ? stats.upcomingGroups : groupByClient(items).sort((a, b) => b.total - a.total)

  return (
    <Card title="Recurring revenue & renewals">
      <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(180px,1fr))]">
        {tiles.map(t => (
          <button key={t.key} onClick={() => setModal(t.key)} className="text-left bg-fp-inset/60 hover:bg-fp-hover rounded-xl px-4 py-3 transition-colors">
            <Eyebrow>{t.label}</Eyebrow>
            <p className={`text-xl font-bold tabular-nums mt-1 ${t.warn ? 'text-amber-500' : 'text-fp-text'}`}>{t.value}</p>
            <p className="text-fp-muted text-xs">{t.sub} · details</p>
          </button>
        ))}
      </div>
      {stats.upcomingGroups.length > 0 && (
        <div className="flex flex-col">
          <Eyebrow>Due in the next 90 days</Eyebrow>
          {stats.upcomingGroups.slice(0, 6).map(g => {
            const d = daysUntil(g.earliest)
            return (
              <Row key={g.clientId || g.company} onClick={g.clientId ? () => go(`/client/${g.clientId}`) : undefined} title={g.company}
                sub={`${isTeam && g.repName ? g.repName + ' · ' : ''}${g.items.map(i => i.item_name).join(', ')}`}
                right={<><span className="block text-fp-text text-sm font-semibold tabular-nums">{money2(g.total)}</span>
                  <span className={`block text-xs font-semibold ${d <= 30 ? 'text-red-500' : d <= 60 ? 'text-amber-500' : 'text-fp-muted'}`}>{d <= 0 ? 'Today' : `${d}d · ${shortDate(g.earliest)}`}</span></>} />
            )
          })}
        </div>
      )}

      {modal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 px-4" onClick={() => setModal(null)}>
          <div className="bg-fp-card border border-fp-border rounded-2xl p-6 w-full max-w-2xl max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-start mb-5 gap-4">
              <div>
                <h3 className="text-fp-text font-bold text-lg">{tiles.find(t => t.key === modal)?.label}</h3>
                <p className="text-fp-muted text-xs mt-0.5">{plural(modalGroups.reduce((s, g) => s + g.items.length, 0), 'item')} · {money2(modalGroups.reduce((s, g) => s + g.total, 0))}</p>
              </div>
              <button onClick={() => setModal(null)} className="text-fp-muted hover:text-fp-text text-sm">Close</button>
            </div>
            {modalGroups.length === 0 ? <Empty>No items.</Empty> : (
              <div className="flex flex-col gap-3">
                {modalGroups.map(g => (
                  <button key={g.clientId || g.company} onClick={() => { setModal(null); g.clientId && go(`/client/${g.clientId}`) }}
                    className="text-left bg-fp-inset/60 hover:bg-fp-hover rounded-xl p-4 transition-colors">
                    <div className="flex justify-between items-start gap-3 mb-2">
                      <div className="min-w-0"><p className="text-fp-text font-semibold truncate">{g.company}</p><p className="text-fp-muted text-xs truncate">{[g.repName, g.proposalName].filter(Boolean).join(' · ')}</p></div>
                      <p className="text-fp-brand font-bold tabular-nums">{money2(g.total)}</p>
                    </div>
                    {g.items.map(it => {
                      const d = daysUntil(it.renewal_date)
                      return (
                        <div key={it.id} className="flex justify-between gap-3 text-xs py-0.5">
                          <span className="text-fp-text/80 truncate">{it.item_name}</span>
                          <span className="flex gap-4 shrink-0 tabular-nums">
                            <span className="text-fp-muted">{money2(it.customer_price_total)}</span>
                            <span className={d <= 30 ? 'text-red-500 font-semibold' : d <= 60 ? 'text-amber-500 font-semibold' : 'text-fp-muted'}>{shortDate(it.renewal_date)}</span>
                          </span>
                        </div>
                      )
                    })}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </Card>
  )
}

// ── Labor forecast ───────────────────────────────────────────────────────────
export function LaborForecast() {
  const { split, data, periodShort } = useDash()
  const s = useMemo(() => {
    const open = split.inPeriod.filter(p => p.status !== 'Won' && p.status !== 'Lost')
    const closing = closingWithin(split.inPeriod, 30)
    const withLabor = open.filter(p => (p.labor_items || []).some(l => parseFloat(l.customer_price) > 0))
    return {
      quoted: laborDollars(open), quotedH: laborHours(open),
      won: laborDollars(split.won), wonH: laborHours(split.won),
      closing: laborDollars(closing), closingH: laborHours(closing),
      avg: withLabor.length ? laborDollars(withLabor) / withLabor.length : 0, withLabor: withLabor.length,
    }
  }, [split])
  if (!data.proposals || (s.quoted === 0 && s.won === 0)) return null
  const total = s.quoted + s.won
  const tiles = [
    { label: 'Labor quoted', value: money(s.quoted), sub: `${Math.round(s.quotedH).toLocaleString()} hrs · open pipeline`, color: C.blue },
    { label: 'Labor won', value: money(s.won), sub: `${Math.round(s.wonH).toLocaleString()} hrs · confirmed backlog`, color: C.green },
    { label: 'Closing in 30 days', value: money(s.closing), sub: `${Math.round(s.closingH).toLocaleString()} hrs · plan ahead`, color: C.orange },
    { label: 'Avg labor per deal', value: money(s.avg), sub: `across ${plural(s.withLabor, 'open deal')}`, color: C.violet },
  ]
  return (
    <Card title="Labor forecast" sub={`Plan crews and backlog${periodShort ? ` · ${periodShort}` : ''}`}>
      <div className="flex items-center gap-6 flex-wrap">
        <Donut size={112} thickness={18} segments={[{ key: 'q', label: 'Quoted', value: s.quoted, color: C.blue }, { key: 'w', label: 'Won', value: s.won, color: C.green }]}
          ariaLabel={`Labor quoted ${money(s.quoted)}, won ${money(s.won)}`}
          center={<div><p className="text-fp-text text-sm font-bold tabular-nums">{total ? Math.round(s.won / total * 100) : 0}%</p><p className="text-fp-muted text-[10px]">won</p></div>} />
        <div className="flex-1 grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(170px,1fr))]">
          {tiles.map(t => (
            <div key={t.label} className="border-l-2 pl-3" style={{ borderColor: t.color }}>
              <Eyebrow>{t.label}</Eyebrow>
              <p className="text-fp-text text-lg font-bold tabular-nums mt-0.5">{t.value}</p>
              <p className="text-fp-muted text-xs">{t.sub}</p>
            </div>
          ))}
        </div>
      </div>
    </Card>
  )
}
