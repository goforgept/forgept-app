import { useEffect, useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabase'
import Sidebar from '../components/Sidebar'
import { useProfile } from '../context/ProfileContext'
import * as XLSX from 'xlsx'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

// ── Multi-select searchable combobox ──────────────────────────────────────────
function MultiSelect({ options, selected, onChange, placeholder = 'Search…' }) {
  const [query, setQuery] = useState('')
  const [open, setOpen]   = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const selectedIds = new Set(selected.map(s => s.value))
  const filtered    = options.filter(o =>
    !selectedIds.has(o.value) &&
    (o.label || '').toLowerCase().includes(query.toLowerCase())
  ).slice(0, 50)

  const add    = (opt) => { onChange([...selected, opt]); setQuery(''); setOpen(false) }
  const remove = (val) => onChange(selected.filter(s => s.value !== val))
  const clear  = () => { onChange([]); setQuery(''); setOpen(false) }

  return (
    <div ref={ref} className="relative min-w-[200px]">
      <div
        className="flex flex-wrap items-center gap-1.5 bg-[#0F1C2E] border border-[#2a3d55] rounded-lg px-2 py-1.5 focus-within:border-[#C8622A] cursor-text"
        onClick={() => setOpen(true)}
      >
        {selected.map(s => (
          <span key={s.value} className="flex items-center gap-1 bg-[#C8622A]/20 text-[#C8622A] text-xs px-2 py-0.5 rounded-full font-medium">
            {s.label}
            <button onClick={(e) => { e.stopPropagation(); remove(s.value) }} className="hover:text-white leading-none">×</button>
          </span>
        ))}
        <input
          className="bg-transparent text-white text-sm outline-none flex-1 min-w-[120px] py-0.5"
          placeholder={selected.length === 0 ? placeholder : 'Add more…'}
          value={query}
          onFocus={() => setOpen(true)}
          onChange={e => { setQuery(e.target.value); setOpen(true) }}
        />
        {selected.length > 0 && (
          <button onClick={(e) => { e.stopPropagation(); clear() }} className="text-[#8A9AB0] hover:text-white text-xs shrink-0 ml-1">✕ Clear</button>
        )}
      </div>
      {open && (
        <div className="absolute z-50 top-full mt-1 left-0 right-0 bg-[#1a2d45] border border-[#2a3d55] rounded-lg shadow-xl max-h-56 overflow-y-auto">
          {filtered.length === 0
            ? <p className="text-[#8A9AB0] text-sm px-3 py-2">{query ? 'No results' : 'All selected or no options'}</p>
            : filtered.map(opt => (
              <button key={opt.value} onClick={() => add(opt)}
                className="w-full text-left px-3 py-2 text-sm text-white hover:bg-[#0F1C2E] transition-colors">
                {opt.label}
              </button>
            ))
          }
        </div>
      )}
    </div>
  )
}

// Single-select searchable combobox
function SearchSelect({ options, value, onChange, placeholder = 'Search…' }) {
  const [query, setQuery]     = useState('')
  const [open, setOpen]       = useState(false)
  const [display, setDisplay] = useState('')
  const ref = useRef(null)

  useEffect(() => { if (!value) { setDisplay(''); setQuery('') } }, [value])
  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const filtered = options.filter(o => (o.label || '').toLowerCase().includes(query.toLowerCase())).slice(0, 50)
  const select = (opt) => { setDisplay(opt.label); setQuery(''); setOpen(false); onChange(opt) }
  const clear  = () => { setDisplay(''); setQuery(''); onChange(null) }

  return (
    <div ref={ref} className="relative min-w-[180px]">
      <div className="flex items-center bg-[#0F1C2E] border border-[#2a3d55] rounded-lg px-3 py-2 gap-2 focus-within:border-[#C8622A]">
        {display && !open && <span className="text-white text-sm truncate max-w-[140px]">{display}</span>}
        <input
          className="bg-transparent text-white text-sm outline-none flex-1"
          placeholder={display ? '' : placeholder}
          value={open ? query : ''}
          onFocus={() => { setOpen(true); setQuery('') }}
          onChange={e => { setQuery(e.target.value); setOpen(true) }}
        />
        {display
          ? <button onClick={clear} className="text-[#8A9AB0] hover:text-white text-xs shrink-0">✕</button>
          : <span className="text-[#8A9AB0] text-xs shrink-0">▾</span>
        }
      </div>
      {open && (
        <div className="absolute z-50 top-full mt-1 left-0 right-0 bg-[#1a2d45] border border-[#2a3d55] rounded-lg shadow-xl max-h-56 overflow-y-auto">
          {filtered.length === 0
            ? <p className="text-[#8A9AB0] text-sm px-3 py-2">No results</p>
            : filtered.map(opt => (
              <button key={opt.value} onClick={() => select(opt)}
                className="w-full text-left px-3 py-2 text-sm text-white hover:bg-[#0F1C2E] transition-colors">
                {opt.label}
              </button>
            ))
          }
        </div>
      )}
    </div>
  )
}

// ── Nav config ────────────────────────────────────────────────────────────────
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
      { key: 'client_report', label: 'Client Report',  icon: '🏢' },
      { key: 'vendor_spend',  label: 'Vendor Summary', icon: '🏭' },
      { key: 'user_activity', label: 'User Activity',  icon: '👥' },
    ]
  },
]

const ALL_REPORTS    = NAV_GROUPS.flatMap(g => g.items)
const NO_DATE_FILTER  = ['user_activity', 'client_report', 'open_jobs'] // don't filter these by created_at
const GRAY_DATE_FILTER = ['user_activity', 'client_report']             // gray out UI for these only

const REPORT_FILTERS = {
  open_quotes:      ['clients', 'rep', 'industry'],
  won_quotes:       ['clients', 'rep', 'industry'],
  lost_quotes:      ['clients', 'rep', 'industry'],
  open_jobs:        ['clients'],
  closed_jobs:      ['clients'],
  service_tickets:  ['clients', 'tech', 'status', 'priority'],
  invoices:         ['status'],
  purchase_orders:  ['vendor', 'status'],
  client_report:    [],
  vendor_spend:     [],
  user_activity:    [],
}

function today()    { return new Date().toISOString().slice(0, 10) }
function daysAgo(n) { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10) }
const fmt$ = (n) => n != null ? `$${Number(n).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}` : '—'

const BLANK_FILTERS = { clients: [], rep: '', industry: '', tech: '', status: '', priority: '', vendorName: '' }

export default function Reports(props) {
  const { profile } = useProfile()
  const navigate    = useNavigate()

  const [activeReport, setActiveReport] = useState('open_quotes')
  const [dateFrom, setDateFrom]         = useState(daysAgo(30))
  const [dateTo, setDateTo]             = useState(today())
  const [filters, setFilters]           = useState(BLANK_FILTERS)
  const [loading, setLoading]           = useState(false)
  const [data, setData]                 = useState([])

  const [selectedClient, setSelectedClient] = useState(null)
  const [clientReport, setClientReport]     = useState(null)
  const [clientLoading, setClientLoading]   = useState(false)

  const [clients,    setClients]    = useState([])
  const [reps,       setReps]       = useState([])
  const [industries, setIndustries] = useState([])
  const [techs,      setTechs]      = useState([])
  const [vendors,    setVendors]    = useState([])

  useEffect(() => {
    if (!props.isAdmin) { navigate('/'); return }
  }, [props.isAdmin])

  useEffect(() => {
    if (!profile?.org_id) return
    const load = async () => {
      const [clientsRes, propsRes, techsRes, vendorsRes] = await Promise.all([
        supabase.from('clients').select('id, company').eq('org_id', profile.org_id).order('company'),
        supabase.from('proposals').select('rep_name, industry').eq('org_id', profile.org_id),
        supabase.from('profiles').select('id, full_name').eq('org_id', profile.org_id).eq('org_role', 'technician'),
        supabase.from('vendors').select('id, vendor_name').eq('org_id', profile.org_id).eq('active', true).order('vendor_name'),
      ])
      setClients((clientsRes.data || []).map(c => ({ value: c.id, label: c.company })))
      setReps([...new Set((propsRes.data || []).map(r => r.rep_name).filter(Boolean))].sort())
      setIndustries([...new Set((propsRes.data || []).map(r => r.industry).filter(Boolean))].sort())
      setTechs((techsRes.data || []).map(t => ({ value: t.id, label: t.full_name })))
      setVendors((vendorsRes.data || []).map(v => ({ value: v.id, label: v.vendor_name })))
    }
    load()
  }, [profile?.org_id])

  useEffect(() => {
    if (profile?.org_id && activeReport !== 'client_report') fetchReport()
  }, [profile?.org_id, activeReport, dateFrom, dateTo, filters])

  const switchReport = (key) => {
    setActiveReport(key)
    setFilters(BLANK_FILTERS)
    setData([])
    if (key !== 'client_report') setClientReport(null)
  }

  const setFilter = (key, val) => setFilters(prev => ({ ...prev, [key]: val }))

  const fetchReport = async () => {
    if (!profile?.org_id) return
    setLoading(true)
    setData([])

    const noDate = NO_DATE_FILTER.includes(activeReport)
    const from   = noDate ? null : dateFrom
    const to     = noDate ? null : dateTo

    const selectedClientIds   = filters.clients.map(c => c.value)
    const selectedClientNames = filters.clients.map(c => c.label)

    // ── Quotes ────────────────────────────────────────────────────────────────
    if (['open_quotes', 'won_quotes', 'lost_quotes'].includes(activeReport)) {
      const statusMap = { open_quotes: ['Draft', 'Sent'], won_quotes: ['Won'], lost_quotes: ['Lost'] }
      let q = supabase
        .from('proposals')
        .select('proposal_name, quote_number, status, client_name, company, industry, proposal_value, total_gross_margin_percent, close_date, created_at, rep_name')
        .eq('org_id', profile.org_id)
        .in('status', statusMap[activeReport])
        .order('created_at', { ascending: false })
      if (from) q = q.gte('created_at', from)
      if (to)   q = q.lte('created_at', to + 'T23:59:59')
      if (filters.rep)      q = q.eq('rep_name', filters.rep)
      if (filters.industry) q = q.eq('industry', filters.industry)
      if (selectedClientNames.length > 0) {
        const orStr = selectedClientNames.flatMap(n => [`company.ilike.%${n}%`, `client_name.ilike.%${n}%`]).join(',')
        q = q.or(orStr)
      }
      const { data: rows, error } = await q
      if (error) console.error(error)
      setData((rows || []).map(r => ({
        'Quote #':    r.quote_number || '—',
        'Name':       r.proposal_name || '—',
        'Status':     r.status,
        'Client':     r.company || r.client_name || '—',
        'Industry':   r.industry || '—',
        'Rep':        r.rep_name || '—',
        'Value':      r.proposal_value ? fmt$(r.proposal_value) : '—',
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
        .select('name, job_number, status, created_at, clients(company)')
        .eq('org_id', profile.org_id)
        .in('status', statusMap[activeReport])
        .order('created_at', { ascending: false })
      if (from) q = q.gte('created_at', from)
      if (to)   q = q.lte('created_at', to + 'T23:59:59')
      if (selectedClientIds.length === 1) q = q.eq('client_id', selectedClientIds[0])
      if (selectedClientIds.length > 1)  q = q.in('client_id', selectedClientIds)
      const { data: rows, error } = await q
      if (error) console.error('jobs error:', error)
      setData((rows || []).map(r => ({
        'Job #':    r.job_number || '—',
        'Job Name': r.name || '—',
        'Status':   r.status,
        'Client':   r.clients?.company || '—',
        'Created':  r.created_at?.slice(0, 10) || '—',
      })))
    }

    // ── Service Tickets ───────────────────────────────────────────────────────
    if (activeReport === 'service_tickets') {
      let q = supabase
        .from('service_tickets')
        .select('ticket_number, title, status, priority, created_at, clients(company), profiles!service_tickets_assigned_tech_id_fkey(full_name)')
        .eq('org_id', profile.org_id)
        .order('created_at', { ascending: false })
      if (from)             q = q.gte('created_at', from)
      if (to)               q = q.lte('created_at', to + 'T23:59:59')
      if (filters.tech)     q = q.eq('assigned_tech_id', filters.tech)
      if (filters.status)   q = q.eq('status', filters.status)
      if (filters.priority) q = q.eq('priority', filters.priority)
      if (selectedClientIds.length === 1) q = q.eq('client_id', selectedClientIds[0])
      if (selectedClientIds.length > 1)  q = q.in('client_id', selectedClientIds)
      const { data: rows, error } = await q
      if (error) console.error(error)
      setData((rows || []).map(r => ({
        'Ticket #': r.ticket_number || '—',
        'Title':    r.title || '—',
        'Status':   r.status,
        'Priority': r.priority || '—',
        'Client':   r.clients?.company || '—',
        'Tech':     r.profiles?.full_name || '—',
        'Created':  r.created_at?.slice(0, 10) || '—',
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
          'Balance':   r.balance_due != null ? fmt$(r.balance_due) : '—',
          'Due Date':  r.due_date || '—',
          'Created':   r.created_at?.slice(0, 10) || '—',
        }
      }))
    }

    // ── Purchase Orders ───────────────────────────────────────────────────────
    if (activeReport === 'purchase_orders') {
      let q = supabase
        .from('purchase_orders')
        .select('po_number, vendor_name, status, total_amount, created_at, proposals(proposal_name, company)')
        .eq('org_id', profile.org_id)
        .order('created_at', { ascending: false })
      if (from)               q = q.gte('created_at', from)
      if (to)                 q = q.lte('created_at', to + 'T23:59:59')
      if (filters.status)     q = q.eq('status', filters.status)
      if (filters.vendorName) q = q.ilike('vendor_name', `%${filters.vendorName}%`)
      const { data: rows, error } = await q
      if (error) console.error(error)
      setData((rows || []).map(r => ({
        'PO #':     r.po_number || '—',
        'Vendor':   r.vendor_name || '—',
        'Proposal': r.proposals?.company || r.proposals?.proposal_name || '—',
        'Status':   r.status || '—',
        'Total':    r.total_amount != null ? fmt$(r.total_amount) : '—',
        'Created':  r.created_at?.slice(0, 10) || '—',
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
      setData(Object.entries(byVendor).sort((a, b) => b[1].cost - a[1].cost).map(([vendor, v]) => ({
        'Vendor': vendor, 'Line Items': v.items, 'Total Units': v.units,
        'Total Cost': fmt$(v.cost), 'Total Revenue': fmt$(v.revenue),
      })))
    }

    // ── User Activity ─────────────────────────────────────────────────────────
    if (activeReport === 'user_activity') {
      const { data: rows } = await supabase
        .from('profiles').select('full_name, email, org_role, last_login, created_at')
        .eq('org_id', profile.org_id)
        .order('last_login', { ascending: false, nullsFirst: false })
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

  // ── Client Report ───────────────────────────────────────────────────────────
  const fetchClientReport = async (client) => {
    if (!client || !profile?.org_id) return
    setSelectedClient(client)
    setClientLoading(true)
    setClientReport(null)

    const [proposalsRes, jobsRes, ticketsRes, invoicesRes] = await Promise.all([
      supabase.from('proposals')
        .select('status, proposal_value, total_gross_margin_percent, created_at')
        .eq('org_id', profile.org_id)
        .or(`company.ilike.%${client.label}%,client_name.ilike.%${client.label}%`),
      supabase.from('jobs')
        .select('name, job_number, status, created_at')
        .eq('org_id', profile.org_id).eq('client_id', client.value),
      supabase.from('service_tickets')
        .select('ticket_number, title, status, priority, created_at')
        .eq('org_id', profile.org_id).eq('client_id', client.value)
        .order('created_at', { ascending: false }),
      supabase.from('invoices')
        .select('status, balance_due, due_date')
        .eq('org_id', profile.org_id),
    ])

    const proposals = proposalsRes.data || []
    const jobs      = jobsRes.data || []
    const tickets   = ticketsRes.data || []
    const now       = new Date()
    const won  = proposals.filter(p => p.status === 'Won')
    const open = proposals.filter(p => ['Draft', 'Sent'].includes(p.status))
    const totalWonValue  = won.reduce((s, p) => s + (Number(p.proposal_value) || 0), 0)
    const totalOpenValue = open.reduce((s, p) => s + (Number(p.proposal_value) || 0), 0)
    const avgMargin = won.length ? (won.reduce((s, p) => s + (Number(p.total_gross_margin_percent) || 0), 0) / won.length) : 0
    const outstanding = (invoicesRes.data || []).filter(i => (i.status === 'Sent' || (i.status === 'Sent' && i.due_date && new Date(i.due_date) < now)))
    const totalOutstanding = outstanding.reduce((s, i) => s + (Number(i.balance_due) || 0), 0)

    setClientReport({
      summary: {
        wonDeals: won.length, totalWonValue,
        openQuotes: open.length, totalOpenValue,
        avgMargin,
        openJobs:    jobs.filter(j => ['Active','On Hold'].includes(j.status)).length,
        closedJobs:  jobs.filter(j => ['Completed','Cancelled'].includes(j.status)).length,
        openTickets: tickets.filter(t => !['Resolved','Cancelled'].includes(t.status)).length,
        totalOutstanding,
      },
      proposals: proposals.map(p => ({
        'Status': p.status, 'Value': fmt$(p.proposal_value),
        'Margin': p.total_gross_margin_percent ? `${Number(p.total_gross_margin_percent).toFixed(1)}%` : '—',
        'Created': p.created_at?.slice(0, 10) || '—',
      })),
      jobs: jobs.map(j => ({ 'Job #': j.job_number || '—', 'Job Name': j.name || '—', 'Status': j.status, 'Created': j.created_at?.slice(0, 10) || '—' })),
      tickets: tickets.map(t => ({ 'Ticket #': t.ticket_number || '—', 'Title': t.title || '—', 'Status': t.status, 'Priority': t.priority || '—', 'Created': t.created_at?.slice(0, 10) || '—' })),
    })
    setClientLoading(false)
  }

  const reportLabel   = ALL_REPORTS.find(r => r.key === activeReport)?.label || ''
  const columns       = data.length > 0 ? Object.keys(data[0]) : []
  const noDate        = GRAY_DATE_FILTER.includes(activeReport)
  const activeFilters = REPORT_FILTERS[activeReport] || []

  const exportExcel = () => {
    const ws = XLSX.utils.json_to_sheet(data); const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, reportLabel)
    XLSX.writeFile(wb, `ForgePt_${reportLabel.replace(/ /g, '_')}_${today()}.xlsx`)
  }

  const exportPDF = () => {
    const doc = new jsPDF({ orientation: columns.length > 6 ? 'landscape' : 'portrait' })
    doc.setFontSize(16); doc.setTextColor(200, 98, 42); doc.text('ForgePt.', 14, 16)
    doc.setTextColor(40, 40, 40); doc.setFontSize(12); doc.text(reportLabel, 14, 24)
    doc.setFontSize(9); doc.setTextColor(120, 120, 120)
    doc.text(`Generated ${new Date().toLocaleDateString()}${noDate ? '' : `  ·  ${dateFrom || ''} – ${dateTo || ''}`}`, 14, 30)
    autoTable(doc, {
      startY: 36, head: [columns], body: data.map(row => columns.map(c => row[c])),
      headStyles: { fillColor: [26, 45, 69], textColor: 255, fontStyle: 'bold', fontSize: 8 },
      bodyStyles: { fontSize: 8, textColor: 40 }, alternateRowStyles: { fillColor: [245, 247, 250] },
      margin: { left: 14, right: 14 },
    })
    doc.save(`ForgePt_${reportLabel.replace(/ /g, '_')}_${today()}.pdf`)
  }

  const selClass = "bg-[#0F1C2E] border border-[#2a3d55] text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-[#C8622A]"

  const MiniTable = ({ rows }) => {
    if (!rows?.length) return <p className="text-[#8A9AB0] text-sm py-3">None</p>
    const cols = Object.keys(rows[0])
    return (
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="border-b border-[#2a3d55]">
            {cols.map(c => <th key={c} className="text-left px-3 py-2 text-[#8A9AB0] text-xs font-semibold uppercase tracking-wide whitespace-nowrap">{c}</th>)}
          </tr></thead>
          <tbody>{rows.map((row, i) => (
            <tr key={i} className="border-b border-[#0F1C2E]/60">
              {cols.map(c => <td key={c} className="px-3 py-2 text-white whitespace-nowrap">{row[c]}</td>)}
            </tr>
          ))}</tbody>
        </table>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen bg-[#0F1C2E]">
      <Sidebar {...props} />
      <div className="flex-1 p-8 overflow-auto">
        <div className="max-w-6xl mx-auto">

          <div className="flex items-center justify-between mb-8">
            <div>
              <h1 className="text-white text-2xl font-bold">Reports</h1>
              <p className="text-[#8A9AB0] text-sm mt-1">Export data as Excel or PDF</p>
            </div>
            {activeReport !== 'client_report' && (
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
            )}
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

            <div className="flex-1 min-w-0">

              {/* ── Client Report ── */}
              {activeReport === 'client_report' ? (
                <div>
                  <div className="bg-[#1a2d45] rounded-xl p-4 mb-4">
                    <label className="block text-[#8A9AB0] text-xs font-medium mb-2">Search Client</label>
                    <div className="max-w-xs">
                      <SearchSelect
                        options={clients}
                        value={selectedClient?.value}
                        onChange={(opt) => opt ? fetchClientReport(opt) : (setSelectedClient(null), setClientReport(null))}
                        placeholder="Type client name…"
                      />
                    </div>
                  </div>
                  {clientLoading && <div className="text-center text-[#8A9AB0] py-16 text-sm">Loading…</div>}
                  {!clientLoading && !clientReport && (
                    <div className="text-center text-[#8A9AB0] py-16 text-sm">Search for a client to see their report</div>
                  )}
                  {clientReport && (
                    <div className="space-y-4">
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        {[
                          { label: 'Won Deals',      value: clientReport.summary.wonDeals,        sub: fmt$(clientReport.summary.totalWonValue) },
                          { label: 'Open Quotes',    value: clientReport.summary.openQuotes,      sub: fmt$(clientReport.summary.totalOpenValue) + ' pipeline' },
                          { label: 'Avg Margin',     value: `${clientReport.summary.avgMargin.toFixed(1)}%`, sub: 'on won deals' },
                          { label: 'Outstanding',    value: fmt$(clientReport.summary.totalOutstanding), sub: 'unpaid invoices' },
                          { label: 'Open Jobs',      value: clientReport.summary.openJobs,        sub: '' },
                          { label: 'Completed Jobs', value: clientReport.summary.closedJobs,      sub: '' },
                          { label: 'Open Tickets',   value: clientReport.summary.openTickets,     sub: '' },
                        ].map(card => (
                          <div key={card.label} className="bg-[#1a2d45] rounded-xl p-4">
                            <p className="text-[#8A9AB0] text-xs font-medium mb-1">{card.label}</p>
                            <p className="text-white text-xl font-bold">{card.value}</p>
                            {card.sub && <p className="text-[#8A9AB0] text-xs mt-0.5">{card.sub}</p>}
                          </div>
                        ))}
                      </div>
                      <div className="bg-[#1a2d45] rounded-xl p-4">
                        <p className="text-white font-semibold mb-3">Proposals ({clientReport.proposals.length})</p>
                        <MiniTable rows={clientReport.proposals} />
                      </div>
                      <div className="bg-[#1a2d45] rounded-xl p-4">
                        <p className="text-white font-semibold mb-3">Jobs ({clientReport.jobs.length})</p>
                        <MiniTable rows={clientReport.jobs} />
                      </div>
                      <div className="bg-[#1a2d45] rounded-xl p-4">
                        <p className="text-white font-semibold mb-3">Service Tickets ({clientReport.tickets.length})</p>
                        <MiniTable rows={clientReport.tickets} />
                      </div>
                    </div>
                  )}
                </div>

              ) : (
                <>
                  {/* Filters */}
                  <div className="bg-[#1a2d45] rounded-xl p-4 mb-4 space-y-3">
                    {/* Date row */}
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
                      <div className="ml-auto text-[#8A9AB0] text-sm self-end pb-0.5">
                        {!loading && <span>{data.length} row{data.length !== 1 ? 's' : ''}</span>}
                      </div>
                    </div>

                    {/* Contextual filters */}
                    {activeFilters.length > 0 && (
                      <div className="flex flex-wrap gap-3 pt-2 border-t border-[#2a3d55]">
                        {activeFilters.includes('clients') && (
                          <div>
                            <label className="block text-[#8A9AB0] text-xs font-medium mb-1">Client</label>
                            <MultiSelect
                              options={clients}
                              selected={filters.clients}
                              onChange={(val) => setFilter('clients', val)}
                              placeholder="Search clients…"
                            />
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
                            <SearchSelect
                              options={techs}
                              value={filters.tech}
                              onChange={(opt) => setFilter('tech', opt?.value || '')}
                              placeholder="All techs…"
                            />
                          </div>
                        )}
                        {activeFilters.includes('status') && (
                          <div>
                            <label className="block text-[#8A9AB0] text-xs font-medium mb-1">Status</label>
                            <select value={filters.status} onChange={e => setFilter('status', e.target.value)} className={selClass}>
                              <option value="">All Statuses</option>
                              {activeReport === 'service_tickets' && ['Open','In Progress','Resolved','Cancelled'].map(s => <option key={s} value={s}>{s}</option>)}
                              {activeReport === 'invoices'        && ['Draft','Sent','Paid'].map(s => <option key={s} value={s}>{s}</option>)}
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
                            <SearchSelect
                              options={vendors}
                              value={filters.vendorName}
                              onChange={(opt) => setFilter('vendorName', opt?.label || '')}
                              placeholder="All vendors…"
                            />
                          </div>
                        )}
                        {(filters.clients.length > 0 || filters.rep || filters.industry || filters.tech || filters.status || filters.priority || filters.vendorName) && (
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
                      <div className="text-center text-[#8A9AB0] py-16 text-sm">Loading…</div>
                    ) : data.length === 0 ? (
                      <div className="text-center text-[#8A9AB0] py-16 text-sm">No data for this report</div>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b border-[#2a3d55]">
                              {columns.map(col => <th key={col} className="text-left px-4 py-3 text-[#8A9AB0] text-xs font-semibold uppercase tracking-wide whitespace-nowrap">{col}</th>)}
                            </tr>
                          </thead>
                          <tbody>
                            {data.map((row, i) => (
                              <tr key={i} className="border-b border-[#0F1C2E]/60 hover:bg-[#0F1C2E]/40 transition-colors">
                                {columns.map(col => <td key={col} className="px-4 py-3 text-white whitespace-nowrap">{row[col]}</td>)}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
