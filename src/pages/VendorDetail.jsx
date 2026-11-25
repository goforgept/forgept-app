// One vendor (who we buy from, e.g. ADI): what we've quoted and won with them, POs, parts, manufacturers, proposals.
// Opened as /vendor?id=<vendors.id> or /vendor?name=<vendor name on line items>.
import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import Sidebar from '../components/Sidebar'
import { supabase } from '../supabase'
import { useProfile } from '../context/ProfileContext'
import { Card, Empty, Ring, Donut, LegendRow, Chip, Row, Eyebrow, Skeleton } from '../dashboard/ui'
import { money, moneyShort, plural, splitByPeriod, PERIODS, PERIOD_SHORT, STAGE_COLOR, SERIES, C, shortDate } from '../dashboard/util'

const norm = (s) => (s || '').trim().toLowerCase()

async function pageAll(build) {
  const out = []
  for (let f = 0; ; f += 1000) {
    const { data, error } = await build(f, f + 999)
    if (error) { console.error('vendor detail:', error.message); break }
    out.push(...(data || []))
    if (!data || data.length < 1000) break
  }
  return out
}

const PO_COLOR = { Draft: C.slate, Sent: C.blue, Partial: C.amber, Received: C.green, Cancelled: C.red }

export default function VendorDetail({ isAdmin, featureProposals = true, featureCRM = false }) {
  const { profile } = useProfile()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const id = params.get('id'), nameParam = params.get('name')
  const [vendor, setVendor] = useState(null)
  const [proposals, setProposals] = useState([])
  const [lines, setLines] = useState([])
  const [pos, setPOs] = useState([])
  const [loading, setLoading] = useState(true)
  const [period, setPeriod] = useState('all')

  useEffect(() => {
    if (!profile?.org_id) return
    let cancelled = false
    ;(async () => {
      setLoading(true)
      // The vendor record (may not exist if the name was only typed on line items)
      let rec = null
      if (id) rec = (await supabase.from('vendors').select('*').eq('org_id', profile.org_id).eq('id', id).maybeSingle()).data
      else if (nameParam) {
        const { data } = await supabase.from('vendors').select('*').eq('org_id', profile.org_id)
        rec = (data || []).find(v => norm(v.vendor_name) === norm(nameParam)) || null
      }
      const name = rec?.vendor_name || nameParam || ''
      const props = await pageAll((f, t) => supabase.from('proposals')
        .select('id, proposal_name, company, client_id, rep_name, status, created_at, updated_at, sent_at')
        .eq('org_id', profile.org_id).eq('is_current_revision', true).is('archived_at', null).range(f, t))
      const propIds = new Set(props.map(p => p.id))
      // Line items carry the vendor as text; match it case-insensitively (escape LIKE wildcards)
      const pattern = name.replace(/[\\%_]/g, m => '\\' + m)
      const items = name ? (await pageAll((f, t) => supabase.from('bom_line_items')
        .select('proposal_id, vendor, manufacturer, item_name, part_number_sku, quantity, your_cost_unit, customer_price_total, pricing_status, rfq_expires_at')
        .ilike('vendor', pattern).range(f, t))).filter(l => propIds.has(l.proposal_id) && norm(l.vendor) === norm(name)) : []
      const allPOs = await pageAll((f, t) => supabase.from('purchase_orders').select('*').eq('org_id', profile.org_id).order('created_at', { ascending: false }).range(f, t))
      if (cancelled) return
      setVendor(rec || { vendor_name: name, missing: true })
      setProposals(props)
      setLines(items)
      setPOs(allPOs.filter(p => (rec && p.vendor_id === rec.id) || (name && norm(p.vendor_name) === norm(name))))
      setLoading(false)
    })()
    return () => { cancelled = true }
  }, [profile?.org_id, id, nameParam])

  const stats = useMemo(() => {
    const withVendor = new Set(lines.map(l => l.proposal_id))
    const split = splitByPeriod(proposals.filter(p => withVendor.has(p.id)), period)
    const quotedIds = new Set(split.inPeriod.map(p => p.id)), wonIds = new Set(split.won.map(p => p.id))
    const blank = () => ({ rev: 0, cost: 0, qty: 0 })
    const q = blank(), w = blank()
    const parts = new Map(), mfrs = new Map(), perProposal = new Map()
    lines.forEach(l => {
      const inQ = quotedIds.has(l.proposal_id), inW = wonIds.has(l.proposal_id)
      if (!inQ && !inW) return
      const qty = Number(l.quantity) || 0, cost = (Number(l.your_cost_unit) || 0) * qty, rev = Number(l.customer_price_total) || 0
      if (inQ) { q.rev += rev; q.cost += cost; q.qty += qty }
      if (inW) { w.rev += rev; w.cost += cost; w.qty += qty }
      const key = l.part_number_sku || l.item_name || 'Unknown'
      const pt = parts.get(key) || { key, name: l.item_name || '—', sku: l.part_number_sku || '', mfr: l.manufacturer || '', qty: 0, wonQty: 0, rev: 0, wonRev: 0 }
      if (inQ) { pt.qty += qty; pt.rev += rev }
      if (inW) { pt.wonQty += qty; pt.wonRev += rev }
      parts.set(key, pt)
      const mk = l.manufacturer?.trim() || 'Unknown'
      const m = mfrs.get(mk) || { label: mk, value: 0, won: 0 }
      if (inQ) m.value += rev
      if (inW) m.won += rev
      mfrs.set(mk, m)
      const pp = perProposal.get(l.proposal_id) || { rev: 0, lines: 0 }
      pp.rev += rev; pp.lines++
      perProposal.set(l.proposal_id, pp)
    })
    const props = proposals.filter(p => perProposal.has(p.id)).map(p => ({ ...p, ...perProposal.get(p.id) }))
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    const rfqOpen = lines.filter(l => l.pricing_status === 'RFQ Sent')
    const today = new Date().toISOString().slice(0, 10)
    return {
      q, w, won: split.won.length, lost: split.lost.length, quotedN: split.inPeriod.length,
      parts: [...parts.values()].sort((a, b) => b.rev - a.rev),
      mfrs: [...mfrs.values()].sort((a, b) => b.value - a.value).map((m, i) => ({ ...m, key: m.label, color: i < 6 ? SERIES[i] : C.slate })),
      props,
      rfqOpen: rfqOpen.length, rfqExpired: rfqOpen.filter(l => l.rfq_expires_at && l.rfq_expires_at < today).length,
    }
  }, [lines, proposals, period])

  const poStats = useMemo(() => {
    const live = pos.filter(p => p.status !== 'Cancelled')
    const by = (s) => pos.filter(p => p.status === s)
    return {
      total: live.reduce((s, p) => s + (p.total_amount || 0), 0),
      open: [...by('Sent'), ...by('Partial')],
      segs: ['Sent', 'Partial', 'Received'].map(s => ({ key: s, label: s === 'Sent' ? 'On order' : s === 'Partial' ? 'Partly received' : 'Received', value: by(s).length, color: PO_COLOR[s] })),
    }
  }, [pos])

  const wonPct = stats.q.rev > 0 ? stats.w.rev / stats.q.rev * 100 : 0
  const margin = stats.w.rev > 0 ? (stats.w.rev - stats.w.cost) / stats.w.rev * 100 : null
  const winRate = stats.won + stats.lost > 0 ? Math.round(stats.won / (stats.won + stats.lost) * 100) : null
  const ps = PERIOD_SHORT[period]

  return (
    <div className="flex h-screen bg-fp-bg">
      <Sidebar isAdmin={isAdmin} featureProposals={featureProposals} featureCRM={featureCRM} />
      <main className="flex-1 min-w-0 overflow-y-auto">
        <div className="max-w-[1400px] mx-auto px-4 md:px-6 py-6 flex flex-col gap-5">
          <button onClick={() => navigate('/vendors')} className="self-start text-fp-muted hover:text-fp-text text-sm">← Vendors</button>

          <header className="flex flex-wrap items-end justify-between gap-4">
            <div className="min-w-0">
              <h1 className="text-fp-text text-[28px] font-bold tracking-tight">{vendor?.vendor_name || nameParam || 'Vendor'}</h1>
              {vendor && !vendor.missing ? (
                <p className="text-fp-muted text-sm mt-1">
                  {[vendor.contact_name, vendor.contact_email, vendor.contact_phone_number, vendor.account_number ? `Acct ${vendor.account_number}` : null, vendor.payment_terms].filter(Boolean).join(' · ') || 'No contact details yet'}
                </p>
              ) : !loading && (
                <p className="text-fp-muted text-sm mt-1">Not in your vendor list yet. Showing line items with this vendor name.</p>
              )}
            </div>
            <div className="flex gap-2">
              <label htmlFor="vendor-period" className="sr-only">Period</label>
              <select id="vendor-period" value={period} onChange={e => setPeriod(e.target.value)}
                className="h-10 bg-fp-card border border-fp-border text-fp-text text-sm font-medium rounded-xl px-3 focus:outline-none focus:border-fp-brand">
                {Object.entries(PERIODS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </select>
            </div>
          </header>

          {loading ? (
            <div className="grid grid-cols-12 gap-4">
              <div className="col-span-12"><Skeleton h={110} /></div>
              <div className="col-span-12 xl:col-span-6"><Skeleton h={260} /></div>
              <div className="col-span-12 xl:col-span-6"><Skeleton h={260} /></div>
            </div>
          ) : (
            <div className="grid grid-cols-12 gap-4">
              {/* Key numbers */}
              <div className="col-span-12 grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(200px,1fr))]">
                {[
                  { label: 'Won' + (ps ? ` · ${ps}` : ''), value: money(stats.w.rev), sub: `of ${money(stats.q.rev)} quoted`, ring: { pct: wonPct, color: C.green, center: `${Math.round(wonPct)}%` } },
                  { label: 'Cost to buy (won)', value: money(stats.w.cost), sub: `${Math.round(stats.w.qty).toLocaleString()} units` },
                  { label: 'Margin on won items', value: margin == null ? '—' : `${margin.toFixed(1)}%`, sub: 'revenue less cost', ring: margin == null ? null : { pct: margin, color: C.violet } },
                  { label: 'Deal win rate', value: winRate == null ? '—' : `${winRate}%`, sub: `${stats.won} won · ${stats.lost} lost of ${plural(stats.quotedN, 'proposal')}`, ring: winRate == null ? null : { pct: winRate, color: C.orange } },
                  { label: 'PO spend', value: money(poStats.total), sub: `${plural(pos.length, 'PO')} · ${poStats.open.length} open`, onClick: () => navigate('/purchase-orders') },
                  { label: 'Pricing requests', value: stats.rfqOpen, sub: stats.rfqExpired ? `${stats.rfqExpired} past expiry` : 'waiting on pricing', alert: stats.rfqExpired > 0 },
                ].map(t => {
                  const Tag = t.onClick ? 'button' : 'div'
                  return (
                    <Tag key={t.label} onClick={t.onClick} className={`text-left bg-fp-card border border-fp-border rounded-2xl px-4 py-4 flex items-center gap-3 min-w-0 ${t.onClick ? 'hover:border-fp-brand/50' : ''}`}>
                      <div className="flex-1 min-w-0">
                        <Eyebrow>{t.label}</Eyebrow>
                        <p className={`text-[22px] font-bold tabular-nums mt-1 truncate ${t.alert ? 'text-amber-500' : 'text-fp-text'}`}>{t.value}</p>
                        <p className="text-fp-muted text-xs mt-0.5 truncate">{t.sub}</p>
                      </div>
                      {t.ring && <Ring size={52} pct={t.ring.pct} color={t.ring.color} center={t.ring.center} />}
                    </Tag>
                  )
                })}
              </div>

              {/* Manufacturers */}
              <div className="col-span-12 xl:col-span-6">
                <Card title="Manufacturers bought through this vendor" sub={`Quoted${ps ? ` · ${ps}` : ''}`}>
                  {stats.mfrs.length === 0 ? <Empty>No line items with this vendor yet.</Empty> : (
                    <div className="flex items-center gap-6 flex-wrap">
                      <div className="mx-auto">
                        <Donut size={160} segments={stats.mfrs.slice(0, 7)} ariaLabel={stats.mfrs.map(m => `${m.label} ${money(m.value)}`).join(', ')}
                          center={<div><p className="text-fp-text text-lg font-bold tabular-nums">{moneyShort(stats.q.rev)}</p><p className="text-fp-muted text-[11px]">quoted</p></div>} />
                      </div>
                      <div className="flex-1 min-w-[220px] max-h-[260px] overflow-y-auto">
                        {stats.mfrs.map(m => <LegendRow key={m.key} color={m.color} label={m.label} meta={m.won ? `${moneyShort(m.won)} won` : 'none won'} value={moneyShort(m.value)} />)}
                      </div>
                    </div>
                  )}
                </Card>
              </div>

              {/* Purchase orders */}
              <div className="col-span-12 xl:col-span-6">
                <Card title="Purchase orders" sub={`${plural(pos.length, 'PO')} · ${money(poStats.total)}`} action={{ label: 'All POs', onClick: () => navigate('/purchase-orders') }}>
                  {pos.length === 0 ? <Empty>No purchase orders to this vendor yet.</Empty> : (
                    <>
                      <div className="flex items-center gap-5 flex-wrap">
                        <div className="mx-auto"><Donut size={116} thickness={18} segments={poStats.segs} ariaLabel={poStats.segs.map(s => `${s.label} ${s.value}`).join(', ')}
                          center={<div><p className="text-fp-text text-lg font-bold tabular-nums">{poStats.open.length}</p><p className="text-fp-muted text-[11px]">open</p></div>} /></div>
                        <div className="flex-1 min-w-[170px]">{poStats.segs.map(s => <LegendRow key={s.key} color={s.color} label={s.label} meta="" value={s.value} />)}</div>
                      </div>
                      <div className="flex flex-col max-h-[220px] overflow-y-auto">
                        {pos.slice(0, 25).map(po => (
                          <Row key={po.id} onClick={() => navigate('/purchase-orders')} title={<span className="font-mono">{po.po_number || 'PO'}</span>}
                            sub={po.created_at ? shortDate(po.created_at) : ''}
                            right={<><span className="block text-fp-text text-sm font-semibold tabular-nums">{money(po.total_amount)}</span><Chip color={PO_COLOR[po.status] || C.slate}>{po.status || '—'}</Chip></>} />
                        ))}
                      </div>
                    </>
                  )}
                </Card>
              </div>

              {/* Parts */}
              <div className="col-span-12">
                <Card title="Parts from this vendor" sub={`${plural(stats.parts.length, 'part')}${ps ? ` · ${ps}` : ''}`}>
                  {stats.parts.length === 0 ? <Empty>No parts quoted from this vendor in this period.</Empty> : (
                    <div className="overflow-x-auto -mx-1">
                      <table className="w-full text-sm border-collapse">
                        <thead>
                          <tr className="text-fp-muted text-xs">
                            {['Part', 'Manufacturer', 'Qty quoted', 'Qty won', 'Quoted', 'Won'].map((h, i) => (
                              <th key={h} scope="col" className={`font-semibold pb-2 px-1 whitespace-nowrap ${i > 1 ? 'text-right' : 'text-left'}`}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {stats.parts.slice(0, 50).map(p => (
                            <tr key={p.key} className="border-t border-fp-border/60">
                              <td className="py-2 px-1 max-w-[340px]"><span className="block text-fp-text font-medium truncate">{p.name}</span>{p.sku && <span className="block text-fp-muted text-xs font-mono truncate">{p.sku}</span>}</td>
                              <td className="py-2 px-1 text-fp-muted whitespace-nowrap">{p.mfr || '—'}</td>
                              <td className="py-2 px-1 text-right tabular-nums text-fp-text">{p.qty.toLocaleString()}</td>
                              <td className="py-2 px-1 text-right tabular-nums text-green-500">{p.wonQty ? p.wonQty.toLocaleString() : '—'}</td>
                              <td className="py-2 px-1 text-right tabular-nums text-fp-text whitespace-nowrap">{money(p.rev)}</td>
                              <td className="py-2 px-1 text-right tabular-nums text-green-500 whitespace-nowrap">{p.wonRev ? money(p.wonRev) : '—'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {stats.parts.length > 50 && <p className="text-fp-muted text-xs mt-2 px-1">Showing the top 50 by quoted value. Reports → Vendor Summary has the full list and export.</p>}
                    </div>
                  )}
                </Card>
              </div>

              {/* Proposals */}
              <div className="col-span-12">
                <Card title="Proposals using this vendor" sub={plural(stats.props.length, 'proposal')}>
                  {stats.props.length === 0 ? <Empty>No proposals use this vendor yet.</Empty> : (
                    <div className="flex flex-col max-h-[480px] overflow-y-auto">
                      {stats.props.map(p => (
                        <Row key={p.id} onClick={() => navigate(`/proposal/${p.id}`)} title={p.proposal_name || 'Untitled'}
                          sub={[p.company, p.rep_name, shortDate(p.created_at), plural(p.lines, 'line')].filter(Boolean).join(' · ')}
                          right={<span className="flex items-center gap-3"><Chip color={STAGE_COLOR[p.status] || C.slate}>{p.status}</Chip><span className="text-fp-text text-sm font-semibold tabular-nums w-24 text-right">{money(p.rev)}</span></span>} />
                      ))}
                    </div>
                  )}
                </Card>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
