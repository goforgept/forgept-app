import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabase'
import Sidebar from '../components/Sidebar'
import { useProfile } from '../context/ProfileContext'
import * as XLSX from 'xlsx'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

const NAV_GROUPS = [
  {
    label: 'Quotes',
    items: [
      { key: 'open_quotes', label: 'Open Quotes',  icon: '📋' },
      { key: 'won_quotes',  label: 'Won Quotes',   icon: '🏆' },
      { key: 'lost_quotes', label: 'Lost Quotes',  icon: '❌' },
    ]
  },
  {
    label: 'Jobs',
    items: [
      { key: 'open_jobs',   label: 'Open Jobs',   icon: '🔨' },
      { key: 'closed_jobs', label: 'Closed Jobs', icon: '✅' },
    ]
  },
  {
    label: 'Operations',
    items: [
      { key: 'service_tickets', label: 'Service Tickets', icon: '🎫' },
      { key: 'invoices',        label: 'Invoices',        icon: '🧾' },
      { key: 'purchase_orders', label: 'Purchase Orders', icon: '📄' },
    ]
  },
  {
    label: 'Other',
    items: [
      { key: 'vendor_spend',  label: 'Vendor Summary', icon: '🏭' },
      { key: 'user_activity', label: 'User Activity',  icon: '👥' },
    ]
  },
]

const ALL_REPORTS    = NAV_GROUPS.flatMap(g => g.items)
const NO_DATE_FILTER = ['user_activity', 'open_jobs']

// Which filter dropdowns each report shows
const REPORT_FILTERS = {
  open_quotes:      ['client', 'rep', 'industry'],
  won_quotes:       ['client', 'rep', 'industry'],
  lost_quotes:      ['client', 'rep', 'industry'],
  open_jobs:        ['client'],
  closed_jobs:      ['client'],
  service_tickets:  ['client', 'tech', 'status', 'priority'],
  invoices:         ['client', 'status'],
  purchase_orders:  ['vendor', 'status'],
  vendor_spend:     [],
  user_activity:    [],
}

function today()    { return new Date().toISOString().slice(0, 10) }
function daysAgo(n) { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10) }

const BLANK_FILTERS = { client: '', rep: '', industry: '', tech: '', status: '', priority: '', vendor: '' }

export default function Reports(props) {
  const { profile } = useProfile()
  const navigate    = useNavigate()

  const [activeReport, setActiveReport] = useState('open_quotes')
  const [dateFrom, setDateFrom]         = useState(daysAgo(30))
  const [dateTo, setDateTo]             = useState(today())
  const [filters, setFilters]           = useState(BLANK_FILTERS)
  const [loading, setLoading]           = useState(false)
  const [data, setData]                 = useState([])

  // Option lists for dropdowns
  const [clients,    setClients]    = useState([])
  const [reps,       setReps]       = useState([])
  const [industries, setIndustries] = useState([])
  const [techs,      setTechs]      = useState([])
  const [vendors,    setVendors]    = useState([])

  useEffect(() => {
    if (!props.isAdmin) { navigate('/'); return }
  }, [props.isAdmin])

  // Load filter options once
  useEffect(() => {
    if (!profile?.org_id) return
    const load = async () => {
      const [clientsRes, propsRes, techsRes, vendorsRes] = await Promise.all([
        supabase.from('clients').select('id, company').eq('org_id', profile.org_id).order('company'),
        supabase.from('proposals').select('rep_name, industry').eq('org_id', profile.org_id),
        supabase.from('profiles').select('id, full_name').eq('org_id', profile.org_id).eq('org_role', 'technician'),
        supabase.from('vendors').select('id, vendor_name').eq('org_id', profile.org_id).eq('active', true).order('vendor_name'),
      ])
      setClients(clientsRes.data || [])
      const allReps = [...new Set((propsRes.data || []).map(r => r.rep_name).filter(Boolean))].sort()
      const allInd  = [...new Set((propsRes.data || []).map(r => r.industry).filter(Boolean))].sort()
      setReps(allReps)
      setIndustries(allInd)
      setTechs(techsRes.data || [])
      setVendors(vendorsRes.data || [])
    }
    load()
  }, [profile?.org_id])

  useEffect(() => {
    if (profile?.org_id) fetchReport()
  }, [profile?.org_id, activeReport, dateFrom, dateTo, filters])

  const switchReport = (key) => {
    setActiveReport(key)
    setFilters(BLANK_FILTERS)
  }

  const setFilter = (key, val) => setFilters(prev => ({ ...prev, [key]: val }))

  const fetchReport = async () => {
    if (!profile?.org_id) return
    setLoading(true)
    setData([])

    const noDate = NO_DATE_FILTER.includes(activeReport)
    const from   = noDate ? null : dateFrom
    const to     = noDate ? null : dateTo

    // ── Quotes ────────────────────────────────────────────────────────────────
    if (['open_quotes', 'won_quotes', 'lost_quotes'].includes(activeReport)) {
      const statusMap = { open_quotes: ['Draft', 'Sent'], won_quotes: ['Won'], lost_quotes: ['Lost'] }
      let q = supabase
        .from('proposals')
        .select('proposal_name, quote_number, status, client_name, company, industry, proposal_value, total_gross_margin_percent, close_date, created_at, rep_name')
        .eq('org_id', profile.org_id)
        .in('status', statusMap[activeReport])
        .order('created_at', { ascending: false })
      if (from)               q = q.gte('created_at', from)
      if (to)                 q = q.lte('created_at', to + 'T23:59:59')
      if (filters.rep)        q = q.eq('rep_name', filters.rep)
      if (filters.industry)   q = q.eq('industry', filters.industry)
      if (filters.client)     q = q.or(`company.ilike.%${filters.client}%,client_name.ilike.%${filters.client}%`)
      const { data: rows, error } = await q
      if (error) console.error(error)
      setData((rows || []).map(r => ({
        'Quote #':    r.quote_number || '—',
        'Name':       r.proposal_name || '—',
        'Status':     r.status,
        'Client':     r.company || r.client_name || '—',
        'Industry':   r.industry || '—',
        'Rep':        r.rep_name || '—',
        'Value':      r.proposal_value ? `$${Number(r.proposal_value).toLocaleString()}` : '—',
        'Margin':     r.total_gross_margin_percent ? `${Number(r.total_gross_margin_percent).toFixed(1)}%` : '—',
        'Close Date': r.close_date || '—',
        'Created':    r.created_at?.slice(0, 10) || '—',
      })))
    }

    // ── Jobs ──────────────────────────────────────────────────────────────────
    if (['open_jobs', 'closed_jobs'].includes(activeReport)) {
      const statusMap = { open_jobs: ['Active', 'On Hold'], closed_jobs: ['Completed', 'Cancelled'] }
      let q = supabase
        .from('jobs')
        .select('title, status, city, state, scheduled_date, created_at, client_id, clients(id, company)')
        .eq('org_id', profile.org_id)
        .in('status', statusMap[activeReport])
        .order('created_at', { ascending: false })
      if (from)           q = q.gte('created_at', from)
      if (to)             q = q.lte('created_at', to + 'T23:59:59')
      if (filters.client) q = q.eq('client_id', filters.client)
      const { data: rows, error } = await q
      if (error) console.error(error)
      setData((rows || []).map(r => ({
        'Job Title': r.title || '—',
        'Status':    r.status,
        'Client':    r.clients?.company || '—',
        'Scheduled': r.scheduled_date || '—',
        'Location':  [r.city, r.state].filter(Boolean).join(', ') || '—',
        'Created':   r.created_at?.slice(0, 10) || '—',
      })))
    }

    // ── Service Tickets ───────────────────────────────────────────────────────
    if (activeReport === 'service_tickets') {
      let q = supabase
        .from('service_tickets')
        .select('ticket_number, title, status, priority, created_at, client_id, assigned_tech_id, clients(company), profiles!service_tickets_assigned_tech_id_fkey(full_name)')
        .eq('org_id', profile.org_id)
        .order('created_at', { ascending: false })
      if (from)             q = q.gte('created_at', from)
      if (to)               q = q.lte('created_at', to + 'T23:59:59')
      if (filters.client)   q = q.eq('client_id', filters.client)
      if (filters.tech)     q = q.eq('assigned_tech_id', filters.tech)
      if (filters.status)   q = q.eq('status', filters.status)
      if (filters.priority) q = q.eq('priority', filters.priority)
      const { data: rows, error } = await q
      if (error) console.error(error)
      setData((rows || []).map(r => ({
        'Ticket #':  r.ticket_number || '—',
        'Title':     r.title || '—',
        'Status':    r.status,
        'Priority':  r.priority || '—',
        'Client':    r.clients?.company || '—',
        'Tech':      r.profiles?.full_name || '—',
        'Created':   r.created_at?.slice(0, 10) || '—',
      })))
    }

    // ── Invoices ──────────────────────────────────────────────────────────────
    if (activeReport === 'invoices') {
      let q = supabase
        .from('invoices')
        .select('invoice_number, status, due_date, balance_due, created_at, proposals(proposal_name, company, client_name)')
        .eq('org_id', profile.org_id)
        .order('created_at', { ascending: false })
      if (from)           q = q.gte('created_at', from)
      if (to)             q = q.lte('created_at', to + 'T23:59:59')
      if (filters.status) q = q.eq('status', filters.status)
      const { data: rows, error } = await q
      if (error) console.error(error)
      const now = new Date()
      setData((rows || []).map(r => {
        const overdue = r.status === 'Sent' && r.due_date && new Date(r.due_date) < now
        return {
          'Invoice #': r.invoice_number || '—',
          'Client':    r.proposals?.company || r.proposals?.client_name || '—',
          'Proposal':  r.proposals?.proposal_name || '—',
          'Status':    overdue ? 'Overdue' : (r.status || '—'),
          'Balance':   r.balance_due != null ? `$${Number(r.balance_due).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—',
          'Due Date':  r.due_date || '—',
          'Created':   r.created_at?.slice(0, 10) || '—',
        }
      }).filter(r => !filters.client || r['Client'].toLowerCase().includes(filters.client.toLowerCase())))
    }

    // ── Purchase Orders ───────────────────────────────────────────────────────
    if (activeReport === 'purchase_orders') {
      let q = supabase
        .from('purchase_orders')
        .select('po_number, vendor_name, status, total_amount, created_at, proposals(proposal_name, company)')
        .eq('org_id', profile.org_id)
        .order('created_at', { ascending: false })
      if (from)           q = q.gte('created_at', from)
      if (to)             q = q.lte('created_at', to + 'T23:59:59')
      if (filters.status) q = q.eq('status', filters.status)
      if (filters.vendor) q = q.ilike('vendor_name', `%${filters.vendor}%`)
      const { data: rows, error } = await q
      if (error) console.error(error)
      setData((rows || []).map(r => ({
        'PO #':      r.po_number || '—',
        'Vendor':    r.vendor_name || '—',
        'Proposal':  r.proposals?.company || r.proposals?.proposal_name || '—',
        'Status':    r.status || '—',
        'Total':     r.total_amount != null ? `$${Number(r.total_amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—',
        'Created':   r.created_at?.slice(0, 10) || '—',
      })))
    }

    // ── Vendor Summary ────────────────────────────────────────────────────────
    if (activeReport === 'vendor_spend') {
      let pq = supabase.from('proposals').select('id').eq('org_id', profile.org_id)
      if (from) pq = pq.gte('created_at', from)
      if (to)   pq = pq.lte('created_at', to + 'T23:59:59')
      const { data: proposals } = await pq
      const ids = (proposals || []).map(p => p.id)
      if (ids.length === 0) { setData([]); setLoading(false); return }
      const { data: rows } = await supabase
        .from('bom_line_items')
        .select('manufacturer, your_cost_unit, quantity, customer_price_total')
        .in('proposal_id', ids)
      const byVendor = {}
      for (const r of (rows || [])) {
        const v = r.manufacturer || 'Unknown'
        if (!byVendor[v]) byVendor[v] = { items: 0, units: 0, cost: 0, revenue: 0 }
        byVendor[v].items++
        byVendor[v].units   += Number(r.quantity) || 0
        byVendor[v].cost    += (Number(r.your_cost_unit) || 0) * (Number(r.quantity) || 0)
        byVendor[v].revenue += Number(r.customer_price_total) || 0
      }
      setData(
        Object.entries(byVendor)
          .sort((a, b) => b[1].cost - a[1].cost)
          .map(([vendor, v]) => ({
            'Vendor':        vendor,
            'Line Items':    v.items,
            'Total Units':   v.units,
            'Total Cost':    `$${v.cost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
            'Total Revenue': `$${v.revenue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
          }))
      )
    }

    // ── User Activity ─────────────────────────────────────────────────────────
    if (activeReport === 'user_activity') {
      const { data: rows, error } = await supabase
        .from('profiles')
        .select('full_name, email, org_role, last_login, created_at')
        .eq('org_id', profile.org_id)
        .order('last_login', { ascending: false, nullsFirst: false })
      if (error) console.error(error)
      setData((rows || []).map(r => ({
        'Name':         r.full_name || '—',
        'Email':        r.email || '—',
        'Role':         r.org_role || '—',
        'Last Login':   r.last_login
          ? new Date(r.last_login).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })
          : 'Never',
        'Member Since': r.created_at?.slice(0, 10) || '—',
      })))
    }

    setLoading(false)
  }

  const reportLabel = ALL_REPORTS.find(r => r.key === activeReport)?.label || ''
  const columns     = data.length > 0 ? Object.keys(data[0]) : []
  const noDate      = NO_DATE_FILTER.includes(activeReport)
  const activeFilters = REPORT_FILTERS[activeReport] || []

  const exportExcel = () => {
    const ws = XLSX.utils.json_to_sheet(data)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, reportLabel)
    XLSX.writeFile(wb, `ForgePt_${reportLabel.replace(/ /g, '_')}_${today()}.xlsx`)
  }

  const exportPDF = () => {
    const doc = new jsPDF({ orientation: columns.length > 6 ? 'landscape' : 'portrait' })
    doc.setFontSize(16); doc.setTextColor(200, 98, 42)
    doc.text('ForgePt.', 14, 16)
    doc.setTextColor(40, 40, 40); doc.setFontSize(12)
    doc.text(reportLabel, 14, 24)
    doc.setFontSize(9); doc.setTextColor(120, 120, 120)
    const dateLabel = noDate ? '' : `  ·  ${dateFrom || ''}${dateTo ? ' – ' + dateTo : ''}`
    doc.text(`Generated ${new Date().toLocaleDateString()}${dateLabel}`, 14, 30)
    autoTable(doc, {
      startY: 36,
      head: [columns],
      body: data.map(row => columns.map(c => row[c])),
      headStyles: { fillColor: [26, 45, 69], textColor: 255, fontStyle: 'bold', fontSize: 8 },
      bodyStyles: { fontSize: 8, textColor: 40 },
      alternateRowStyles: { fillColor: [245, 247, 250] },
      margin: { left: 14, right: 14 },
    })
    doc.save(`ForgePt_${reportLabel.replace(/ /g, '_')}_${today()}.pdf`)
  }

  const selClass = "bg-[#0F1C2E] border border-[#2a3d55] text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-[#C8622A]"

  return (
    <div className="flex min-h-screen bg-[#0F1C2E]">
      <Sidebar {...props} />
      <div className="flex-1 p-8 overflow-auto">
        <div className="max-w-6xl mx-auto">

          {/* Header */}
          <div className="flex items-center justify-between mb-8">
            <div>
              <h1 className="text-white text-2xl font-bold">Reports</h1>
              <p className="text-[#8A9AB0] text-sm mt-1">Export data as Excel or PDF</p>
            </div>
            <div className="flex gap-3">
              <button onClick={exportExcel} disabled={data.length === 0}
                className="flex items-center gap-2 px-4 py-2 bg-[#1a7a4a] hover:bg-[#1a7a4a]/80 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors">
                <span>📊</span> Export Excel
              </button>
              <button onClick={exportPDF} disabled={data.length === 0}
                className="flex items-center gap-2 px-4 py-2 bg-[#C8622A] hover:bg-[#C8622A]/80 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors">
                <span>📄</span> Export PDF
              </button>
            </div>
          </div>

          <div className="flex gap-6">
            {/* Left nav */}
            <div className="w-48 shrink-0 space-y-4">
              {NAV_GROUPS.map(group => (
                <div key={group.label}>
                  <p className="text-[#8A9AB0] text-xs font-semibold uppercase tracking-wider px-3 mb-1">{group.label}</p>
                  <div className="space-y-0.5">
                    {group.items.map(r => (
                      <button key={r.key} onClick={() => switchReport(r.key)}
                        className={`w-full text-left px-3 py-2 rounded-lg text-sm font-medium flex items-center gap-2.5 transition-all ${
                          activeReport === r.key ? 'bg-[#C8622A]/20 text-[#C8622A]' : 'text-[#8A9AB0] hover:text-white hover:bg-[#1a2d45]'
                        }`}>
                        <span>{r.icon}</span>{r.label}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            {/* Right — filters + table */}
            <div className="flex-1 min-w-0">

              {/* Date + filters row */}
              <div className="bg-[#1a2d45] rounded-xl p-4 mb-4 space-y-3">
                <div className="flex flex-wrap items-end gap-3">
                  {/* Date range */}
                  <div className={`flex flex-wrap items-end gap-3 ${noDate ? 'opacity-40 pointer-events-none select-none' : ''}`}>
                    <div>
                      <label className="block text-[#8A9AB0] text-xs font-medium mb-1">From</label>
                      <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className={selClass} />
                    </div>
                    <div>
                      <label className="block text-[#8A9AB0] text-xs font-medium mb-1">To</label>
                      <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className={selClass} />
                    </div>
                    <div className="flex gap-2 pb-0.5">
                      <button onClick={() => { setDateFrom(daysAgo(30)); setDateTo(today()) }} className="text-xs px-3 py-1.5 rounded-lg bg-[#0F1C2E] text-[#8A9AB0] hover:text-white transition-colors">30d</button>
                      <button onClick={() => { setDateFrom(daysAgo(90)); setDateTo(today()) }} className="text-xs px-3 py-1.5 rounded-lg bg-[#0F1C2E] text-[#8A9AB0] hover:text-white transition-colors">90d</button>
                      <button onClick={() => { setDateFrom(''); setDateTo('') }}               className="text-xs px-3 py-1.5 rounded-lg bg-[#0F1C2E] text-[#8A9AB0] hover:text-white transition-colors">All</button>
                    </div>
                  </div>
                  <div className="ml-auto text-[#8A9AB0] text-sm self-end pb-0.5">
                    {!loading && <span>{data.length} row{data.length !== 1 ? 's' : ''}</span>}
                  </div>
                </div>

                {/* Contextual filters */}
                {activeFilters.length > 0 && (
                  <div className="flex flex-wrap gap-3 pt-1 border-t border-[#2a3d55]">
                    {activeFilters.includes('client') && (
                      <div>
                        <label className="block text-[#8A9AB0] text-xs font-medium mb-1">Client</label>
                        <select value={filters.client} onChange={e => setFilter('client', e.target.value)} className={selClass}>
                          <option value="">All Clients</option>
                          {clients.map(c => <option key={c.id} value={
                            /* jobs filter by id, others by name string */
                            ['open_jobs','closed_jobs'].includes(activeReport) ? c.id : c.company
                          }>{c.company}</option>)}
                        </select>
                      </div>
                    )}
                    {activeFilters.includes('rep') && (
                      <div>
                        <label className="block text-[#8A9AB0] text-xs font-medium mb-1">Rep</label>
                        <select value={filters.rep} onChange={e => setFilter('rep', e.target.value)} className={selClass}>
                          <option value="">All Reps</option>
                          {reps.map(r => <option key={r} value={r}>{r}</option>)}
                        </select>
                      </div>
                    )}
                    {activeFilters.includes('industry') && (
                      <div>
                        <label className="block text-[#8A9AB0] text-xs font-medium mb-1">Industry</label>
                        <select value={filters.industry} onChange={e => setFilter('industry', e.target.value)} className={selClass}>
                          <option value="">All Industries</option>
                          {industries.map(i => <option key={i} value={i}>{i}</option>)}
                        </select>
                      </div>
                    )}
                    {activeFilters.includes('tech') && (
                      <div>
                        <label className="block text-[#8A9AB0] text-xs font-medium mb-1">Technician</label>
                        <select value={filters.tech} onChange={e => setFilter('tech', e.target.value)} className={selClass}>
                          <option value="">All Techs</option>
                          {techs.map(t => <option key={t.id} value={t.id}>{t.full_name}</option>)}
                        </select>
                      </div>
                    )}
                    {activeFilters.includes('status') && (
                      <div>
                        <label className="block text-[#8A9AB0] text-xs font-medium mb-1">Status</label>
                        <select value={filters.status} onChange={e => setFilter('status', e.target.value)} className={selClass}>
                          <option value="">All Statuses</option>
                          {activeReport === 'service_tickets' && ['Open','In Progress','Resolved','Cancelled'].map(s => <option key={s} value={s}>{s}</option>)}
                          {activeReport === 'invoices'        && ['Draft','Sent','Paid','Overdue'].map(s => <option key={s} value={s}>{s}</option>)}
                          {activeReport === 'purchase_orders' && ['Draft','Sent','Partial','Received','Cancelled'].map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                      </div>
                    )}
                    {activeFilters.includes('priority') && (
                      <div>
                        <label className="block text-[#8A9AB0] text-xs font-medium mb-1">Priority</label>
                        <select value={filters.priority} onChange={e => setFilter('priority', e.target.value)} className={selClass}>
                          <option value="">All Priorities</option>
                          {['Low','Normal','High','Urgent'].map(p => <option key={p} value={p}>{p}</option>)}
                        </select>
                      </div>
                    )}
                    {activeFilters.includes('vendor') && (
                      <div>
                        <label className="block text-[#8A9AB0] text-xs font-medium mb-1">Vendor</label>
                        <select value={filters.vendor} onChange={e => setFilter('vendor', e.target.value)} className={selClass}>
                          <option value="">All Vendors</option>
                          {vendors.map(v => <option key={v.id} value={v.vendor_name}>{v.vendor_name}</option>)}
                        </select>
                      </div>
                    )}
                    {Object.values(filters).some(Boolean) && (
                      <div className="self-end pb-0.5">
                        <button onClick={() => setFilters(BLANK_FILTERS)} className="text-xs px-3 py-1.5 rounded-lg bg-[#0F1C2E] text-[#8A9AB0] hover:text-white transition-colors">Clear filters</button>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Table */}
              <div className="bg-[#1a2d45] rounded-xl overflow-hidden">
                {loading ? (
                  <div className="text-center text-[#8A9AB0] py-16 text-sm">Loading...</div>
                ) : data.length === 0 ? (
                  <div className="text-center text-[#8A9AB0] py-16 text-sm">No data for this report</div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-[#2a3d55]">
                          {columns.map(col => (
                            <th key={col} className="text-left px-4 py-3 text-[#8A9AB0] text-xs font-semibold uppercase tracking-wide whitespace-nowrap">{col}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {data.map((row, i) => (
                          <tr key={i} className="border-b border-[#0F1C2E]/60 hover:bg-[#0F1C2E]/40 transition-colors">
                            {columns.map(col => (
                              <td key={col} className="px-4 py-3 text-white whitespace-nowrap">{row[col]}</td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
