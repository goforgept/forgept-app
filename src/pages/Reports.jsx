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
      { key: 'open_jobs',   label: 'Open Jobs',    icon: '🔨' },
      { key: 'closed_jobs', label: 'Closed Jobs',  icon: '✅' },
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

const ALL_REPORTS = NAV_GROUPS.flatMap(g => g.items)
const NO_DATE_FILTER = ['user_activity']

function today()    { return new Date().toISOString().slice(0, 10) }
function daysAgo(n) {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d.toISOString().slice(0, 10)
}

export default function Reports(props) {
  const { profile } = useProfile()
  const navigate = useNavigate()
  const [activeReport, setActiveReport] = useState('open_quotes')
  const [dateFrom, setDateFrom] = useState(daysAgo(30))
  const [dateTo, setDateTo]     = useState(today())
  const [loading, setLoading]   = useState(false)
  const [data, setData]         = useState([])

  useEffect(() => {
    if (!props.isAdmin) { navigate('/'); return }
  }, [props.isAdmin])

  useEffect(() => {
    if (profile?.org_id) fetchReport()
  }, [profile?.org_id, activeReport, dateFrom, dateTo])

  const fetchReport = async () => {
    if (!profile?.org_id) return
    setLoading(true)
    setData([])

    const from = NO_DATE_FILTER.includes(activeReport) ? null : dateFrom
    const to   = NO_DATE_FILTER.includes(activeReport) ? null : dateTo

    // ── Quotes ────────────────────────────────────────────────────────────────
    if (['open_quotes', 'won_quotes', 'lost_quotes'].includes(activeReport)) {
      const statusMap = {
        open_quotes: ['Draft', 'Sent'],
        won_quotes:  ['Won'],
        lost_quotes: ['Lost'],
      }
      let q = supabase
        .from('proposals')
        .select('proposal_name, quote_number, status, client_name, company, industry, proposal_value, total_gross_margin_percent, close_date, created_at, rep_name')
        .eq('org_id', profile.org_id)
        .in('status', statusMap[activeReport])
        .order('created_at', { ascending: false })
      if (from) q = q.gte('created_at', from)
      if (to)   q = q.lte('created_at', to + 'T23:59:59')
      const { data: rows, error } = await q
      if (error) console.error('quotes error:', error)
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
      const statusMap = {
        open_jobs:   ['Active', 'On Hold'],
        closed_jobs: ['Completed', 'Cancelled'],
      }
      let q = supabase
        .from('jobs')
        .select('title, status, city, state, scheduled_date, created_at, clients(company), profiles!jobs_assigned_pm_fkey(full_name)')
        .eq('org_id', profile.org_id)
        .in('status', statusMap[activeReport])
        .order('created_at', { ascending: false })
      if (from) q = q.gte('created_at', from)
      if (to)   q = q.lte('created_at', to + 'T23:59:59')
      const { data: rows, error } = await q
      if (error) console.error('jobs error:', error)
      setData((rows || []).map(r => ({
        'Job Title':  r.title || '—',
        'Status':     r.status,
        'Client':     r.clients?.company || '—',
        'PM':         r.profiles?.full_name || '—',
        'Scheduled':  r.scheduled_date || '—',
        'Location':   [r.city, r.state].filter(Boolean).join(', ') || '—',
        'Created':    r.created_at?.slice(0, 10) || '—',
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
      if (error) console.error('user_activity error:', error)
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

  const exportExcel = () => {
    const ws = XLSX.utils.json_to_sheet(data)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, reportLabel)
    XLSX.writeFile(wb, `ForgePt_${reportLabel.replace(/ /g, '_')}_${today()}.xlsx`)
  }

  const exportPDF = () => {
    const doc = new jsPDF({ orientation: columns.length > 6 ? 'landscape' : 'portrait' })
    doc.setFontSize(16)
    doc.setTextColor(200, 98, 42)
    doc.text('ForgePt.', 14, 16)
    doc.setTextColor(40, 40, 40)
    doc.setFontSize(12)
    doc.text(reportLabel, 14, 24)
    doc.setFontSize(9)
    doc.setTextColor(120, 120, 120)
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
              <button
                onClick={exportExcel}
                disabled={data.length === 0}
                className="flex items-center gap-2 px-4 py-2 bg-[#1a7a4a] hover:bg-[#1a7a4a]/80 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors"
              >
                <span>📊</span> Export Excel
              </button>
              <button
                onClick={exportPDF}
                disabled={data.length === 0}
                className="flex items-center gap-2 px-4 py-2 bg-[#C8622A] hover:bg-[#C8622A]/80 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors"
              >
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
                      <button
                        key={r.key}
                        onClick={() => setActiveReport(r.key)}
                        className={`w-full text-left px-3 py-2 rounded-lg text-sm font-medium flex items-center gap-2.5 transition-all ${
                          activeReport === r.key
                            ? 'bg-[#C8622A]/20 text-[#C8622A]'
                            : 'text-[#8A9AB0] hover:text-white hover:bg-[#1a2d45]'
                        }`}
                      >
                        <span>{r.icon}</span>{r.label}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            {/* Right — filters + table */}
            <div className="flex-1 min-w-0">

              {/* Filters */}
              <div className={`bg-[#1a2d45] rounded-xl p-4 mb-4 flex flex-wrap items-end gap-4 ${noDate ? 'opacity-40 pointer-events-none select-none' : ''}`}>
                <div>
                  <label className="block text-[#8A9AB0] text-xs font-medium mb-1">From</label>
                  <input
                    type="date"
                    value={dateFrom}
                    onChange={e => setDateFrom(e.target.value)}
                    className="bg-[#0F1C2E] border border-[#2a3d55] text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-[#C8622A]"
                  />
                </div>
                <div>
                  <label className="block text-[#8A9AB0] text-xs font-medium mb-1">To</label>
                  <input
                    type="date"
                    value={dateTo}
                    onChange={e => setDateTo(e.target.value)}
                    className="bg-[#0F1C2E] border border-[#2a3d55] text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-[#C8622A]"
                  />
                </div>
                <div className="flex gap-2 pb-0.5">
                  <button onClick={() => { setDateFrom(daysAgo(30)); setDateTo(today()) }} className="text-xs px-3 py-1.5 rounded-lg bg-[#0F1C2E] text-[#8A9AB0] hover:text-white transition-colors">Last 30d</button>
                  <button onClick={() => { setDateFrom(daysAgo(90)); setDateTo(today()) }} className="text-xs px-3 py-1.5 rounded-lg bg-[#0F1C2E] text-[#8A9AB0] hover:text-white transition-colors">Last 90d</button>
                  <button onClick={() => { setDateFrom(''); setDateTo('') }}               className="text-xs px-3 py-1.5 rounded-lg bg-[#0F1C2E] text-[#8A9AB0] hover:text-white transition-colors">All time</button>
                </div>
                <div className="ml-auto text-[#8A9AB0] text-sm">
                  {!loading && <span>{data.length} row{data.length !== 1 ? 's' : ''}</span>}
                </div>
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
                            <th key={col} className="text-left px-4 py-3 text-[#8A9AB0] text-xs font-semibold uppercase tracking-wide whitespace-nowrap">
                              {col}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {data.map((row, i) => (
                          <tr key={i} className="border-b border-[#0F1C2E]/60 hover:bg-[#0F1C2E]/40 transition-colors">
                            {columns.map(col => (
                              <td key={col} className="px-4 py-3 text-white whitespace-nowrap">
                                {row[col]}
                              </td>
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
