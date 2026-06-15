import { useEffect, useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabase'
import Sidebar from '../components/Sidebar'
import { useProfile } from '../context/ProfileContext'
import * as XLSX from 'xlsx'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

const REPORTS = [
  { key: 'open_jobs',     label: 'Open Jobs',      icon: '🔨' },
  { key: 'closed_jobs',   label: 'Closed Jobs',    icon: '✅' },
  { key: 'open_quotes',   label: 'Open Quotes',    icon: '📋' },
  { key: 'vendor_spend',  label: 'Vendor Summary', icon: '🏭' },
  { key: 'user_activity', label: 'User Activity',  icon: '👥' },
]

const JOB_OPEN_STATUSES   = ['Active', 'On Hold']
const JOB_CLOSED_STATUSES = ['Completed', 'Cancelled']

export default function Reports(props) {
  const { profile } = useProfile()
  const navigate = useNavigate()
  const [activeReport, setActiveReport] = useState('open_jobs')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [loading, setLoading] = useState(false)
  const [data, setData] = useState([])

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

    if (activeReport === 'open_jobs') {
      let q = supabase
        .from('jobs')
        .select('title, status, address, city, state, scheduled_date, created_at, clients(company), proposals(proposal_name, proposal_value), profiles!jobs_assigned_pm_fkey(full_name)')
        .eq('org_id', profile.org_id)
        .in('status', JOB_OPEN_STATUSES)
        .order('created_at', { ascending: false })
      if (dateFrom) q = q.gte('created_at', dateFrom)
      if (dateTo)   q = q.lte('created_at', dateTo + 'T23:59:59')
      const { data: rows } = await q
      setData((rows || []).map(r => ({
        'Job Title':       r.title,
        'Status':          r.status,
        'Client':          r.clients?.company || '—',
        'Proposal':        r.proposals?.proposal_name || '—',
        'Value':           r.proposals?.proposal_value ? `$${Number(r.proposals.proposal_value).toLocaleString()}` : '—',
        'PM':              r.profiles?.full_name || '—',
        'Scheduled':       r.scheduled_date || '—',
        'Location':        [r.city, r.state].filter(Boolean).join(', ') || '—',
        'Created':         r.created_at?.slice(0, 10) || '—',
      })))
    }

    if (activeReport === 'closed_jobs') {
      let q = supabase
        .from('jobs')
        .select('title, status, address, city, state, scheduled_date, created_at, clients(company), proposals(proposal_name, proposal_value), profiles!jobs_assigned_pm_fkey(full_name)')
        .eq('org_id', profile.org_id)
        .in('status', JOB_CLOSED_STATUSES)
        .order('created_at', { ascending: false })
      if (dateFrom) q = q.gte('created_at', dateFrom)
      if (dateTo)   q = q.lte('created_at', dateTo + 'T23:59:59')
      const { data: rows } = await q
      setData((rows || []).map(r => ({
        'Job Title':  r.title,
        'Status':     r.status,
        'Client':     r.clients?.company || '—',
        'Proposal':   r.proposals?.proposal_name || '—',
        'Value':      r.proposals?.proposal_value ? `$${Number(r.proposals.proposal_value).toLocaleString()}` : '—',
        'PM':         r.profiles?.full_name || '—',
        'Scheduled':  r.scheduled_date || '—',
        'Location':   [r.city, r.state].filter(Boolean).join(', ') || '—',
        'Created':    r.created_at?.slice(0, 10) || '—',
      })))
    }

    if (activeReport === 'open_quotes') {
      let q = supabase
        .from('proposals')
        .select('proposal_name, quote_number, status, client_name, company, industry, total_price, total_gross_margin_percent, close_date, created_at, rep_name')
        .eq('org_id', profile.org_id)
        .in('status', ['Draft', 'Sent'])
        .order('created_at', { ascending: false })
      if (dateFrom) q = q.gte('created_at', dateFrom)
      if (dateTo)   q = q.lte('created_at', dateTo + 'T23:59:59')
      const { data: rows } = await q
      setData((rows || []).map(r => ({
        'Quote #':    r.quote_number || '—',
        'Name':       r.proposal_name,
        'Status':     r.status,
        'Client':     r.company || r.client_name || '—',
        'Industry':   r.industry || '—',
        'Rep':        r.rep_name || '—',
        'Total':      r.total_price ? `$${Number(r.total_price).toLocaleString()}` : '—',
        'Margin':     r.total_gross_margin_percent ? `${Number(r.total_gross_margin_percent).toFixed(1)}%` : '—',
        'Close Date': r.close_date || '—',
        'Created':    r.created_at?.slice(0, 10) || '—',
      })))
    }

    if (activeReport === 'vendor_spend') {
      // Get proposal IDs for this org first (PostgREST can't filter on joined table in JS client)
      let pq = supabase.from('proposals').select('id').eq('org_id', profile.org_id)
      if (dateFrom) pq = pq.gte('created_at', dateFrom)
      if (dateTo)   pq = pq.lte('created_at', dateTo + 'T23:59:59')
      const { data: proposals } = await pq
      const proposalIds = (proposals || []).map(p => p.id)

      if (proposalIds.length === 0) { setData([]); setLoading(false); return }

      const { data: rows } = await supabase
        .from('bom_line_items')
        .select('manufacturer, your_cost_unit, quantity, customer_price_total')
        .in('proposal_id', proposalIds)

      const byVendor = {}
      for (const r of (rows || [])) {
        const vendor = r.manufacturer || 'Unknown'
        if (!byVendor[vendor]) byVendor[vendor] = { items: 0, units: 0, cost: 0, revenue: 0 }
        byVendor[vendor].items++
        byVendor[vendor].units   += Number(r.quantity) || 0
        byVendor[vendor].cost    += (Number(r.your_cost_unit) || 0) * (Number(r.quantity) || 0)
        byVendor[vendor].revenue += Number(r.customer_price_total) || 0
      }

      setData(
        Object.entries(byVendor)
          .sort((a, b) => b[1].cost - a[1].cost)
          .map(([vendor, v]) => ({
            'Vendor / Manufacturer': vendor,
            'Line Items':            v.items,
            'Total Units':           v.units,
            'Total Cost':            `$${v.cost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
            'Total Revenue':         `$${v.revenue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
          }))
      )
    }

    if (activeReport === 'user_activity') {
      const { data: rows } = await supabase
        .from('profiles')
        .select('full_name, email, org_role, last_login, created_at')
        .eq('org_id', profile.org_id)
        .order('last_login', { ascending: false, nullsFirst: false })

      setData((rows || []).map(r => ({
        'Name':       r.full_name || '—',
        'Email':      r.email || '—',
        'Role':       r.org_role || '—',
        'Last Login': r.last_login
          ? new Date(r.last_login).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })
          : 'Never',
        'Member Since': r.created_at?.slice(0, 10) || '—',
      })))
    }

    setLoading(false)
  }

  const reportLabel = REPORTS.find(r => r.key === activeReport)?.label || ''
  const columns = data.length > 0 ? Object.keys(data[0]) : []

  const exportExcel = () => {
    const ws = XLSX.utils.json_to_sheet(data)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, reportLabel)
    XLSX.writeFile(wb, `ForgePt_${reportLabel.replace(/ /g, '_')}_${new Date().toISOString().slice(0, 10)}.xlsx`)
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
    doc.text(`Generated ${new Date().toLocaleDateString()}${dateFrom || dateTo ? `  ·  ${dateFrom || ''}${dateTo ? ' – ' + dateTo : ''}` : ''}`, 14, 30)
    autoTable(doc, {
      startY: 36,
      head: [columns],
      body: data.map(row => columns.map(c => row[c])),
      headStyles: { fillColor: [26, 45, 69], textColor: 255, fontStyle: 'bold', fontSize: 8 },
      bodyStyles: { fontSize: 8, textColor: 40 },
      alternateRowStyles: { fillColor: [245, 247, 250] },
      margin: { left: 14, right: 14 },
    })
    doc.save(`ForgePt_${reportLabel.replace(/ /g, '_')}_${new Date().toISOString().slice(0, 10)}.pdf`)
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
            {/* Left — report picker */}
            <div className="w-52 shrink-0 space-y-1">
              {REPORTS.map(r => (
                <button
                  key={r.key}
                  onClick={() => setActiveReport(r.key)}
                  className={`w-full text-left px-4 py-3 rounded-lg text-sm font-medium flex items-center gap-3 transition-all ${
                    activeReport === r.key
                      ? 'bg-[#C8622A]/20 text-[#C8622A]'
                      : 'text-[#8A9AB0] hover:text-white hover:bg-[#1a2d45]'
                  }`}
                >
                  <span>{r.icon}</span>{r.label}
                </button>
              ))}
            </div>

            {/* Right — filters + table */}
            <div className="flex-1 min-w-0">
              {/* Filters */}
              <div className={`bg-[#1a2d45] rounded-xl p-4 mb-4 flex flex-wrap items-end gap-4 ${activeReport === 'user_activity' ? 'opacity-40 pointer-events-none' : ''}`}>
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
                {(dateFrom || dateTo) && (
                  <button
                    onClick={() => { setDateFrom(''); setDateTo('') }}
                    className="text-[#8A9AB0] hover:text-white text-sm pb-0.5"
                  >
                    Clear
                  </button>
                )}
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
