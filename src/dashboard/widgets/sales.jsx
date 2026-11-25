import { useMemo, useState } from 'react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import { useDash } from '../context'
import { Card, Empty, Ring, Donut, LegendRow, Chip, Initials, Row, Eyebrow } from '../ui'
import { pval, money, moneyShort, plural, isOpen, daysUntil, daysSince, closingWithin, shortDate, C, STAGE_COLOR, SERIES, DAY } from '../util'

// ── Key numbers ──────────────────────────────────────────────────────────────
export function KeyNumbers() {
  const { split, data, periodShort, periodTarget, marginGoal, go, proposalsUrl } = useDash()
  const proposals = data.proposals || []
  const { inPeriod, won, lost, open } = split
  const openVal = open.reduce((s, p) => s + pval(p), 0)
  const wonVal = won.reduce((s, p) => s + pval(p), 0)
  const winRate = won.length + lost.length > 0 ? Math.round(won.length / (won.length + lost.length) * 100) : null
  const avgDeal = inPeriod.length ? inPeriod.reduce((s, p) => s + pval(p), 0) / inPeriod.length : 0
  const mSrc = inPeriod.filter(p => p.total_gross_margin_percent)
  const avgMargin = mSrc.length ? mSrc.reduce((s, p) => s + p.total_gross_margin_percent, 0) / mSrc.length : null
  const closing = closingWithin(proposals, 30)
  const created30 = proposals.filter(p => new Date(p.created_at) >= new Date(Date.now() - 30 * DAY)).length
  const wonTarget = periodTarget('revenue_won')
  const suffix = periodShort ? ` · ${periodShort}` : ''

  const tiles = [
    { label: 'Open pipeline', value: money(openVal), sub: plural(open.length, 'open deal'), onClick: () => go(proposalsUrl('active')) },
    {
      label: 'Won' + suffix, value: money(wonVal), onClick: () => go(proposalsUrl('Won')),
      sub: wonTarget ? `of ${money(wonTarget)} target` : plural(won.length, 'deal'),
      ring: wonTarget ? { pct: wonVal / wonTarget * 100, color: C.green, center: `${Math.round(wonVal / wonTarget * 100)}%` } : null,
    },
    {
      label: 'Win rate', value: winRate == null ? '—' : `${winRate}%`, sub: `${won.length} won · ${lost.length} lost`,
      ring: winRate == null ? null : { pct: winRate, color: C.orange },
    },
    {
      label: 'Avg margin', value: avgMargin == null ? '—' : `${avgMargin.toFixed(1)}%`,
      sub: marginGoal ? `goal ${marginGoal}%` : 'gross margin',
      ring: avgMargin == null ? null : { pct: marginGoal ? avgMargin / marginGoal * 100 : avgMargin, color: C.violet },
    },
    { label: 'Avg deal size', value: money(avgDeal), sub: plural(inPeriod.length, 'proposal') },
    { label: 'Closing in 30 days', value: closing.length, sub: money(closing.reduce((s, p) => s + pval(p), 0)), onClick: () => go('/proposals?closing=30'), alert: closing.length > 0 },
    { label: 'Created, last 30 days', value: created30, sub: 'new proposals' },
  ]
  return (
    <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(190px,1fr))]">
      {tiles.map(t => {
        const Tag = t.onClick ? 'button' : 'div'
        return (
          <Tag key={t.label} onClick={t.onClick}
            className={`text-left bg-fp-card border border-fp-border rounded-2xl px-4 py-4 flex items-center gap-3 min-w-0 ${t.onClick ? 'hover:border-fp-brand/50 transition-colors' : ''}`}>
            <div className="flex-1 min-w-0">
              <Eyebrow>{t.label}</Eyebrow>
              <p className={`text-[22px] font-bold tracking-tight tabular-nums mt-1 truncate ${t.alert ? 'text-amber-500' : 'text-fp-text'}`}>{t.value}</p>
              <p className="text-fp-muted text-xs mt-0.5 truncate">{t.sub}</p>
            </div>
            {t.ring && <Ring size={52} pct={t.ring.pct} color={t.ring.color} center={t.ring.center ?? (t.value === '—' ? '' : null)} />}
          </Tag>
        )
      })}
    </div>
  )
}

// ── This month's target ──────────────────────────────────────────────────────
export function TargetProgress() {
  const { data, monthTargets, isTeam, canSetTargets, go } = useDash()
  const now = new Date()
  const start = new Date(now.getFullYear(), now.getMonth(), 1)
  const wonMonth = (data.proposals || []).filter(p => p.status === 'Won' && new Date(p.updated_at || p.created_at) >= start)
  const wonVal = wonMonth.reduce((s, p) => s + pval(p), 0)
  const { revenue, deals } = monthTargets
  const monthName = now.toLocaleDateString('en-US', { month: 'long' })
  const dayPct = Math.round(now.getDate() / new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate() * 100)

  const items = [
    { label: 'Revenue won', value: money(wonVal), target: revenue, pct: revenue ? wonVal / revenue * 100 : null, color: C.green, fmt: money },
    { label: 'Deals won', value: wonMonth.length, target: deals, pct: deals ? wonMonth.length / deals * 100 : null, color: C.blue, fmt: (n) => Math.round(n) },
  ]
  return (
    <Card title={`${monthName} ${isTeam ? 'team ' : ''}target`} sub={`${dayPct}% of the month gone`}
      action={canSetTargets ? { label: revenue || deals ? 'Targets' : 'Set a target', onClick: () => go('/settings#goals') } : null}>
      <div className="grid grid-cols-2 gap-4">
        {items.map(it => (
          <div key={it.label} className="flex flex-col items-center text-center gap-2">
            {it.target
              ? <Ring size={104} stroke={3.5} pct={it.pct} color={it.pct >= 100 ? C.green : it.color} center={`${Math.round(it.pct)}%`} />
              : <div className="w-[104px] h-[104px] rounded-full border-[6px] border-fp-inset grid place-items-center"><span className="text-fp-text text-lg font-bold tabular-nums">{it.value}</span></div>}
            <div>
              <p className="text-fp-text text-sm font-semibold">{it.label}</p>
              <p className="text-fp-muted text-xs tabular-nums">{it.target ? `${it.value} of ${it.fmt(it.target)}` : 'No target set'}</p>
            </div>
          </div>
        ))}
      </div>
    </Card>
  )
}

// ── Pipeline by stage (donut) ────────────────────────────────────────────────
export function PipelineDonut() {
  const { split, periodShort, go, proposalsUrl, isTeam } = useDash()
  const groups = { Draft: split.inPeriod.filter(p => p.status === 'Draft'), Sent: split.inPeriod.filter(p => p.status === 'Sent'), Won: split.won, Lost: split.lost }
  const segs = Object.entries(groups).map(([k, ps]) => ({ key: k, label: k, color: STAGE_COLOR[k], count: ps.length, value: ps.reduce((s, p) => s + pval(p), 0) }))
  const total = segs.reduce((s, x) => s + x.value, 0)
  const open = segs[0].value + segs[1].value, openN = segs[0].count + segs[1].count
  return (
    <Card title={isTeam ? 'Pipeline by stage' : 'My pipeline'} sub={periodShort || 'All time'}
      right={<span className="text-fp-muted text-xs tabular-nums">{plural(openN, 'open deal')} · {money(open)}</span>}>
      {total === 0 ? <Empty>No proposals in this period yet.</Empty> : (
        <div className="flex items-center gap-8 flex-wrap">
          <div className="mx-auto">
            <Donut size={196} segments={segs} onSelect={(s) => go(proposalsUrl(s.key))}
              ariaLabel={segs.map(s => `${s.label} ${money(s.value)}`).join(', ')}
              center={<div><p className="text-fp-text text-xl font-bold tabular-nums">{moneyShort(open)}</p><p className="text-fp-muted text-xs">open</p></div>} />
          </div>
          <div className="flex-1 min-w-[230px]">
            {segs.map(s => (
              <LegendRow key={s.key} color={s.color} label={s.label} onClick={() => go(proposalsUrl(s.key))}
                meta={`${plural(s.count, 'deal')} · ${total ? Math.round(s.value / total * 100) : 0}%`} value={money(s.value)} />
            ))}
          </div>
        </div>
      )}
    </Card>
  )
}

// ── Closing soon ─────────────────────────────────────────────────────────────
export function ClosingSoon() {
  const { data, isTeam, go } = useDash()
  const rows = closingWithin(data.proposals || [], 30).sort((a, b) => new Date(a.close_date) - new Date(b.close_date))
  return (
    <Card title="Closing in the next 30 days" sub={rows.length ? `${plural(rows.length, 'deal')} · ${money(rows.reduce((s, p) => s + pval(p), 0))}` : null}
      action={{ label: 'Pipeline', onClick: () => go('/proposals?closing=30') }}>
      {rows.length === 0 ? <Empty>Nothing closing in the next 30 days.</Empty> : (
        <div className="overflow-x-auto -mx-1">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="text-fp-muted text-xs">
                <th scope="col" className="text-left font-semibold pb-2 px-1">Deal</th>
                <th scope="col" className="text-left font-semibold pb-2 px-1">Stage</th>
                <th scope="col" className="text-right font-semibold pb-2 px-1">Value</th>
                <th scope="col" className="text-right font-semibold pb-2 px-1">Close</th>
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, 8).map(p => {
                const d = daysUntil(p.close_date)
                return (
                  <tr key={p.id} onClick={() => go(`/proposal/${p.id}`)} className="border-t border-fp-border/60 cursor-pointer hover:bg-fp-hover/50">
                    <td className="py-2.5 px-1 max-w-0 w-full">
                      <span className="block text-fp-text font-medium truncate">{p.proposal_name || 'Untitled'}</span>
                      <span className="block text-fp-muted text-xs truncate">{p.company}{isTeam && p.rep_name ? ` · ${p.rep_name}` : ''}</span>
                    </td>
                    <td className="py-2.5 px-1"><Chip color={STAGE_COLOR[p.status] || C.slate}>{p.status}</Chip></td>
                    <td className="py-2.5 px-1 text-right text-fp-text font-semibold tabular-nums whitespace-nowrap">{money(pval(p))}</td>
                    <td className={`py-2.5 px-1 text-right tabular-nums whitespace-nowrap ${d <= 7 ? 'text-amber-500 font-semibold' : 'text-fp-muted'}`}>
                      {d === 0 ? 'Today' : shortDate(p.close_date)}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          {rows.length > 8 && <button onClick={() => go('/proposals?closing=30')} className="text-fp-muted hover:text-fp-text text-xs mt-2 px-1">+{rows.length - 8} more</button>}
        </div>
      )}
    </Card>
  )
}

// ── Needs attention ──────────────────────────────────────────────────────────
function AttentionGroup({ label, color, items, render }) {
  const [all, setAll] = useState(false)
  if (!items.length) return null
  const shown = all ? items : items.slice(0, 4)
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full" style={{ background: color }} /><Eyebrow>{label} · {items.length}</Eyebrow></div>
      {shown.map(render)}
      {items.length > 4 && <button onClick={() => setAll(v => !v)} className="text-fp-muted hover:text-fp-text text-xs text-left">{all ? 'Show fewer' : `Show all ${items.length}`}</button>}
    </div>
  )
}

export function NeedsAttention() {
  const { data, isTeam, go, markAsSent } = useDash()
  const proposals = data.proposals || []
  const byId = useMemo(() => new Map(proposals.map(p => [p.id, p])), [proposals])
  const now = new Date(), in10 = new Date(Date.now() + 10 * DAY)
  const pricing = (data.expiredPricing || []).map(id => byId.get(id)).filter(Boolean)
  const expiring = proposals.filter(p => p.status === 'Sent' && p.quote_expires_at && new Date(p.quote_expires_at) >= now && new Date(p.quote_expires_at) <= in10)
    .sort((a, b) => new Date(a.quote_expires_at) - new Date(b.quote_expires_at))
  const expired = proposals.filter(p => p.status === 'Sent' && p.quote_expires_at && new Date(p.quote_expires_at) < now)
    .sort((a, b) => new Date(a.quote_expires_at) - new Date(b.quote_expires_at))
  const drafts = proposals.filter(p => p.status === 'Draft' && daysSince(p.created_at) >= 3)
    .sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
  const total = pricing.length + expiring.length + expired.length + drafts.length
  const who = (p) => [p.company, isTeam ? p.rep_name : null].filter(Boolean).join(' · ')

  return (
    <Card title="Needs attention" right={total > 0 && <span className="text-xs font-bold px-2 py-0.5 rounded-full text-fp-brand bg-fp-brand/15 tabular-nums">{total}</span>}>
      {total === 0 ? <Empty>All clear. No stale drafts or expiring quotes.</Empty> : (
        <div className="flex flex-col gap-4">
          <AttentionGroup label="Pricing expired, re-quote vendors" color={C.red} items={pricing} render={p => (
            <Row key={p.id} onClick={() => go(`/proposal/${p.id}`)} title={p.proposal_name || 'Untitled'} sub={who(p)} right={<span className="text-red-500 text-xs font-semibold">RFQ expired</span>} />
          )} />
          <AttentionGroup label="Quotes expiring in 10 days" color={C.amber} items={expiring} render={p => {
            const d = daysUntil(p.quote_expires_at)
            return <Row key={p.id} onClick={() => go(`/proposal/${p.id}`)} title={p.proposal_name || 'Untitled'} sub={who(p)}
              right={<span className="text-amber-500 text-xs font-semibold">{d <= 0 ? 'Today' : d === 1 ? '1 day left' : `${d} days left`}</span>} />
          }} />
          <AttentionGroup label="Expired quotes, follow up or re-send" color={C.orange} items={expired} render={p => {
            const d = daysSince(p.quote_expires_at)
            return <Row key={p.id} onClick={() => go(`/proposal/${p.id}`)} title={p.proposal_name || 'Untitled'} sub={who(p)}
              right={<span className="text-fp-muted text-xs">{d === 0 ? 'Expired today' : `${d}d ago`}</span>} />
          }} />
          <AttentionGroup label="Drafts not sent in 3+ days" color={C.slate} items={drafts} render={p => (
            <div key={p.id} className="flex items-center gap-3">
              <div className="flex-1 min-w-0"><Row onClick={() => go(`/proposal/${p.id}`)} title={p.proposal_name || 'Untitled'} sub={`${who(p)}${who(p) ? ' · ' : ''}${daysSince(p.created_at)} days old · ${money(pval(p))}`} /></div>
              <button onClick={() => markAsSent(p.id)} className="shrink-0 text-xs font-semibold text-fp-brand border border-fp-brand/40 hover:bg-fp-brand hover:text-white rounded-lg px-2.5 py-1 transition-colors">Mark sent</button>
            </div>
          )} />
        </div>
      )}
    </Card>
  )
}

// ── Rep leaderboard ──────────────────────────────────────────────────────────
export function Leaderboard() {
  const { split, periodShort, go } = useDash()
  const reps = useMemo(() => {
    const m = new Map()
    const get = (p) => { const k = p.rep_name || 'Unknown'; if (!m.has(k)) m.set(k, { name: k, pipeline: 0, won: 0, count: 0, margins: [] }); return m.get(k) }
    split.inPeriod.forEach(p => { const r = get(p); r.count++; if (isOpen(p)) r.pipeline += pval(p); if (p.total_gross_margin_percent) r.margins.push(p.total_gross_margin_percent) })
    split.won.forEach(p => { get(p).won += pval(p) })
    return [...m.values()].map(r => ({ ...r, margin: r.margins.length ? r.margins.reduce((a, b) => a + b, 0) / r.margins.length : null }))
      .sort((a, b) => b.won - a.won || b.pipeline - a.pipeline)
  }, [split])
  const totalWon = reps.reduce((s, r) => s + r.won, 0)
  // Top 6 reps get their own slice; everyone else is grouped so the donut stays readable
  const segs = reps.filter(r => r.won > 0).slice(0, 6).map((r, i) => ({ key: r.name, label: r.name, value: r.won, color: SERIES[i % SERIES.length] }))
  const rest = reps.filter(r => r.won > 0).slice(6).reduce((s, r) => s + r.won, 0)
  if (rest > 0) segs.push({ key: '__rest', label: 'Everyone else', value: rest, color: C.slate })
  const colorOf = new Map(segs.map(s => [s.key, s.color]))
  const openRep = (name) => go(`/proposals?rep=${encodeURIComponent(name)}`)
  return (
    <Card title="Rep leaderboard" sub={`Ranked by won revenue${periodShort ? ` · ${periodShort}` : ''}`}>
      {reps.length === 0 ? <Empty>No proposals in this period yet.</Empty> : (
        <div className="flex items-start gap-6 flex-wrap">
          <div className="mx-auto">
            <Donut size={176} segments={segs} onSelect={(s) => s.key !== '__rest' && openRep(s.key)}
              ariaLabel={segs.map(s => `${s.label} ${money(s.value)}`).join(', ')}
              center={<div><p className="text-fp-text text-lg font-bold tabular-nums">{moneyShort(totalWon)}</p><p className="text-fp-muted text-[11px]">won</p></div>} />
          </div>
          <div className="flex-1 min-w-[240px] max-h-[360px] overflow-y-auto">
            {reps.map((r, i) => (
              <button key={r.name} onClick={() => openRep(r.name)}
                className="w-full grid grid-cols-[20px_10px_minmax(0,1fr)_auto] gap-3 items-center text-left py-2 border-t border-fp-border/60 first:border-t-0 hover:bg-fp-hover/50 rounded-md px-1 -mx-1">
                <span className={`text-xs font-bold tabular-nums ${i < 3 ? 'text-fp-brand' : 'text-fp-muted'}`}>{i + 1}</span>
                <span className="w-2.5 h-2.5 rounded-full" style={{ background: colorOf.get(r.name) || (r.won > 0 ? C.slate : 'var(--fp-inset)') }} />
                <span className="min-w-0">
                  <span className="block text-fp-text text-sm font-medium truncate">{r.name}</span>
                  <span className="block text-fp-muted text-xs tabular-nums truncate">{money(r.pipeline)} open{r.margin != null ? ` · ${r.margin.toFixed(0)}% margin` : ''}</span>
                </span>
                <span className="text-right">
                  <span className="block text-fp-text text-sm font-semibold tabular-nums">{money(r.won)}</span>
                  <span className="block text-fp-muted text-xs tabular-nums">{totalWon ? Math.round(r.won / totalWon * 100) : 0}%</span>
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </Card>
  )
}

// ── Rep targets (this month) ─────────────────────────────────────────────────
export function RepTargets() {
  const { data, personMonthTarget, canSetTargets, go } = useDash()
  const now = new Date(), start = new Date(now.getFullYear(), now.getMonth(), 1)
  const rows = (data.profiles || []).map(pr => {
    const won = (data.proposals || []).filter(p => p.status === 'Won' && p.user_id === pr.id && new Date(p.updated_at || p.created_at) >= start)
    const wonVal = won.reduce((s, p) => s + pval(p), 0)
    const target = personMonthTarget(pr.id, 'revenue_won'), dealsTarget = personMonthTarget(pr.id, 'deals_won')
    return { ...pr, wonVal, wonN: won.length, target, dealsTarget, pct: target ? wonVal / target * 100 : null }
  }).filter(r => r.target || r.wonVal > 0).sort((a, b) => (b.pct ?? -1) - (a.pct ?? -1) || b.wonVal - a.wonVal)
  return (
    <Card title={`Rep targets · ${now.toLocaleDateString('en-US', { month: 'long' })}`} sub="Won this month against each person's target"
      action={canSetTargets ? { label: 'Set targets', onClick: () => go('/settings#goals') } : null}>
      {rows.length === 0 ? <Empty>No targets set and nothing won yet this month. Targets are optional.</Empty> : (
        <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(210px,1fr))]">
          {rows.map(r => (
            <div key={r.id} className="flex items-center gap-3 bg-fp-inset/60 rounded-xl px-3 py-3">
              {r.target
                ? <Ring size={56} pct={r.pct} color={r.pct >= 100 ? C.green : r.pct >= 70 ? C.orange : C.blue} center={`${Math.round(r.pct)}%`} />
                : <div className="w-14 h-14 rounded-full border-4 border-fp-inset grid place-items-center text-fp-muted text-xs">—</div>}
              <div className="min-w-0">
                <p className="text-fp-text text-sm font-semibold truncate">{r.full_name || r.email}</p>
                <p className="text-fp-muted text-xs tabular-nums">{money(r.wonVal)}{r.target ? ` of ${money(r.target)}` : ' won · no target'}</p>
                {r.dealsTarget > 0 && <p className="text-fp-muted text-xs tabular-nums">{r.wonN} of {Math.round(r.dealsTarget)} deals</p>}
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  )
}

// ── Top clients ──────────────────────────────────────────────────────────────
export function TopClients() {
  const { split, data, periodShort, go } = useDash()
  const names = useMemo(() => new Map((data.clients || []).map(c => [c.id, c.company])), [data.clients])
  const rows = useMemo(() => {
    const m = new Map()
    const get = (p) => {
      const k = p.client_id || p.company || 'Unknown'
      if (!m.has(k)) m.set(k, { key: k, id: p.client_id, name: names.get(p.client_id) || p.company || 'Unknown', pipeline: 0, won: 0, count: 0, wonN: 0 })
      return m.get(k)
    }
    split.inPeriod.forEach(p => { const r = get(p); r.count++; if (isOpen(p)) r.pipeline += pval(p) })
    split.won.forEach(p => { const r = get(p); r.won += pval(p); r.wonN++ })
    return [...m.values()].sort((a, b) => (b.pipeline + b.won) - (a.pipeline + a.won)).slice(0, 10)
  }, [split, names])
  return (
    <Card title="Top clients" sub={`Open + won${periodShort ? ` · ${periodShort}` : ''}`}>
      {rows.length === 0 ? <Empty>No client data yet.</Empty> : (
        <div className="flex flex-col max-h-[420px] overflow-y-auto">
          {rows.map((c, i) => (
            <Row key={c.key} onClick={c.id ? () => go(`/client/${c.id}`) : undefined} lead={<Initials name={c.name} color={SERIES[i % SERIES.length]} />}
              title={c.name} sub={`${plural(c.count, 'proposal')}${c.wonN ? ` · ${c.wonN} won` : ''}`}
              right={<><span className="block text-fp-text text-sm font-semibold tabular-nums">{money(c.pipeline + c.won)}</span>{c.won > 0 && <span className="block text-green-500 text-xs tabular-nums">{moneyShort(c.won)} won</span>}</>} />
          ))}
        </div>
      )}
    </Card>
  )
}

// ── Top vendors (donut) ──────────────────────────────────────────────────────
export function TopVendors() {
  const { split, data, periodShort, go } = useDash()
  const segs = useMemo(() => {
    const ids = new Set(split.inPeriod.map(p => p.id))
    const m = new Map()
    ;(data.vendorLines || []).forEach(l => {
      if (!ids.has(l.proposal_id) || !l.vendor) return
      const r = m.get(l.vendor) || { label: l.vendor, value: 0, count: 0 }
      r.value += l.customer_price_total || 0; r.count++
      m.set(l.vendor, r)
    })
    return [...m.values()].sort((a, b) => b.value - a.value).slice(0, 6).map((r, i) => ({ ...r, key: r.label, color: SERIES[i % SERIES.length] }))
  }, [split, data.vendorLines])
  const total = segs.reduce((s, x) => s + x.value, 0)
  return (
    <Card title="Top vendors" sub={`By quoted value${periodShort ? ` · ${periodShort}` : ''}`} action={{ label: 'Vendors', onClick: () => go('/vendors') }}>
      {segs.length === 0 ? <Empty>No vendor data yet.</Empty> : (
        <div className="flex items-center gap-5 flex-wrap">
          <div className="mx-auto"><Donut size={132} thickness={18} segments={segs} ariaLabel={segs.map(s => `${s.label} ${money(s.value)}`).join(', ')}
            center={<div><p className="text-fp-text text-base font-bold tabular-nums">{moneyShort(total)}</p><p className="text-fp-muted text-[11px]">top {segs.length}</p></div>} /></div>
          <div className="flex-1 min-w-[180px]">
            {segs.map(s => <LegendRow key={s.key} color={s.color} label={s.label} meta={`${s.count} lines`} value={moneyShort(s.value)} />)}
          </div>
        </div>
      )}
    </Card>
  )
}

// ── Won by month (12 months; the one place columns beat a ring) ──────────────
export function WonTrend() {
  const { data, isTeam } = useDash()
  const rows = useMemo(() => {
    const now = new Date()
    const months = Array.from({ length: 12 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - 11 + i, 1)
      return { key: `${d.getFullYear()}-${d.getMonth()}`, label: d.toLocaleDateString('en-US', { month: 'short' }), value: 0, current: i === 11 }
    })
    const idx = new Map(months.map((m, i) => [m.key, i]))
    ;(data.proposals || []).forEach(p => {
      if (p.status !== 'Won') return
      const d = new Date(p.updated_at || p.created_at)
      const i = idx.get(`${d.getFullYear()}-${d.getMonth()}`)
      if (i != null) months[i].value += pval(p)
    })
    return months
  }, [data.proposals])
  const total = rows.reduce((s, r) => s + r.value, 0)
  return (
    <Card title={isTeam ? 'Won by month' : 'My wins by month'} sub="Last 12 months" right={<span className="text-fp-muted text-xs tabular-nums">{money(total)} total</span>}>
      {total === 0 ? <Empty>No wins in the last 12 months yet.</Empty> : (
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={rows} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
            <XAxis dataKey="label" tick={{ fill: 'var(--fp-muted)', fontSize: 11 }} axisLine={false} tickLine={false} />
            <YAxis tickFormatter={moneyShort} tick={{ fill: 'var(--fp-muted)', fontSize: 11 }} axisLine={false} tickLine={false} width={52} />
            <Tooltip cursor={{ fill: 'var(--fp-hover)' }} content={({ active, payload }) => active && payload?.length ? (
              <div className="bg-fp-card border border-fp-border rounded-lg px-3 py-2 text-sm shadow-xl">
                <p className="text-fp-muted text-xs">{payload[0].payload.label}</p>
                <p className="text-fp-text font-semibold tabular-nums">{money(payload[0].value)}</p>
              </div>
            ) : null} />
            <Bar dataKey="value" radius={[5, 5, 0, 0]} maxBarSize={36}>
              {rows.map(r => <Cell key={r.key} fill={r.current ? C.brand : C.blue} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}
    </Card>
  )
}
