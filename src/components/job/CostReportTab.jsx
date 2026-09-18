import { useState, useEffect } from 'react'
import { setAIPageContext, clearAIPageContext } from '../../aiPageContext'

const fmt = (n) => (n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export default function CostReportTab({ job, proposal, proposalSections = [], lineItems, freeformPOItems, changeOrders, techLogs, checklist, onExportPDF, laborRates = [], onAddManualEntry }) {
  // Merge proposal-level labor with section labor items
  const allLaborItems = [
    ...(proposal?.labor_items || []),
    ...(proposalSections || []).flatMap(s => (s.labor_items || []).map(l => ({ ...l, _sectionName: s.name }))),
  ]
  const quotedMaterials = lineItems.reduce((sum, i) => sum + (i.customer_price_total || 0), 0)
  const quotedLabor = allLaborItems.reduce((sum, l) => sum + (parseFloat(l.customer_price) || 0), 0)
  const quotedTotal = quotedMaterials + quotedLabor
  const costMaterials = lineItems.reduce((sum, i) => sum + ((i.your_cost_unit || 0) * (i.quantity || 0)), 0)
  const costLabor = allLaborItems.reduce((sum, l) => sum + ((parseFloat(l.your_cost) || 0) * (parseFloat(l.quantity) || 0)), 0)
  const approvedCOs = changeOrders.filter(c => c.status === 'Approved').reduce((sum, c) => sum + (c.amount || 0), 0)
  const costCOs = changeOrders.filter(c => c.status === 'Approved').reduce((sum, co) => {
    if (co.your_cost != null) return sum + parseFloat(co.your_cost)
    const matCost = (co.line_items || []).reduce((s, l) => s + ((parseFloat(l.your_cost_unit) || 0) * (parseFloat(l.quantity) || 0)), 0)
    const labCost = (co.labor_items || []).reduce((s, l) => s + ((parseFloat(l.your_cost) || 0) * (parseFloat(l.quantity) || 0)), 0)
    return sum + matCost + labCost
  }, 0)
  const freeformPOCost = freeformPOItems.reduce((sum, l) => sum + (l.total || 0), 0)
  const hoursLogged = techLogs.reduce((sum, l) => sum + (l.hours_worked || 0), 0)
  const totalRevenue = quotedTotal + approvedCOs
  const totalCost = costMaterials + costLabor + costCOs + freeformPOCost
  const grossMargin = totalRevenue > 0 ? ((totalRevenue - totalCost) / totalRevenue * 100).toFixed(1) : '0.0'
  const overBudget = totalRevenue > 0 && totalCost > totalRevenue
  const nearBudget = !overBudget && totalRevenue > 0 && totalCost / totalRevenue > 0.8

  const rows = [
    { label: 'Quoted Materials', quoted: quotedMaterials, cost: costMaterials, color: 'text-fp-text' },
    { label: 'Quoted Labor', quoted: quotedLabor, cost: costLabor, color: 'text-fp-text' },
    ...(approvedCOs > 0 ? [{ label: 'Approved Change Orders', quoted: approvedCOs, cost: costCOs, color: 'text-[#C8622A]' }] : []),
    ...(freeformPOCost > 0 ? [{ label: 'Freeform POs (Job-linked)', quoted: 0, cost: freeformPOCost, color: 'text-blue-400' }] : []),
  ]

  const usedByItemId = {}
  let materialAdjustmentCost = 0
  techLogs.forEach(log => {
    if (!log.materials_used) return
    try {
      const parsed = JSON.parse(log.materials_used)
      if (Array.isArray(parsed)) parsed.forEach(m => {
        if (m.id?.startsWith('adj_')) {
          // Manual adjustment entry — has a direct cost field
          materialAdjustmentCost += parseFloat(m.cost) || 0
        } else {
          usedByItemId[m.id] = (usedByItemId[m.id] || 0) + (parseFloat(m.qty) || 0)
        }
      })
    } catch {}
  })
  const totalPlannedUnits = lineItems.reduce((sum, i) => sum + (parseFloat(i.quantity) || 0), 0)
  const totalUsedUnits = lineItems.reduce((sum, i) => sum + (usedByItemId[i.id] || 0), 0)
  const materialsPct = totalPlannedUnits > 0 ? Math.min((totalUsedUnits / totalPlannedUnits) * 100, 100) : 0
  const materialsOver = totalUsedUnits > totalPlannedUnits
  const estimatedHours = allLaborItems.reduce((sum, l) => sum + (parseFloat(l.quantity) || 0), 0)
  const laborPct = estimatedHours > 0 ? Math.min((hoursLogged / estimatedHours) * 100, 100) : 0
  const laborOver = hoursLogged > estimatedHours
  const checklistTotal = checklist.length
  const checklistDone = checklist.filter(c => c.completed).length
  const checklistPct = checklistTotal > 0 ? (checklistDone / checklistTotal) * 100 : 0
  const actualMaterialCost = lineItems.reduce((sum, i) => sum + ((usedByItemId[i.id] || 0) * (i.your_cost_unit || 0)), 0) + materialAdjustmentCost
  // Per-tech rate: use profile.labor_role → laborRates lookup, fall back to blended average
  const rateByRole = Object.fromEntries(laborRates.map(r => [r.role, parseFloat(r.cost_per_hour) || 0]))
  const blendedLaborRate = estimatedHours > 0 ? costLabor / estimatedHours : 0
  const actualLaborCost = techLogs.reduce((sum, log) => {
    const role = log.profiles?.labor_role
    const rate = role && rateByRole[role] != null ? rateByRole[role] : blendedLaborRate
    return sum + (log.hours_worked || 0) * rate
  }, 0)
  const actualCostTotal = actualMaterialCost + actualLaborCost
  const costBurnPct = totalCost > 0 ? Math.min((actualCostTotal / totalCost) * 100, 100) : 0

  // Labor profitability
  const laborQuotedRevenue = allLaborItems.reduce((s, l) => s + (parseFloat(l.customer_price) || 0), 0)
  const laborBudgetedCost = allLaborItems.reduce((s, l) => s + ((parseFloat(l.your_cost) || 0) * (parseFloat(l.quantity) || 0)), 0)
  const laborActualCost = actualLaborCost
  const laborCostOverage = laborActualCost - laborBudgetedCost // positive = over budget
  const laborBudgetMargin = laborQuotedRevenue - laborBudgetedCost
  const laborActualMargin = laborQuotedRevenue - laborActualCost
  const laborBudgetMarginPct = laborQuotedRevenue > 0 ? (laborBudgetMargin / laborQuotedRevenue * 100).toFixed(1) : null
  const laborActualMarginPct = laborQuotedRevenue > 0 ? (laborActualMargin / laborQuotedRevenue * 100).toFixed(1) : null

  // Per-tech breakdown
  const techBreakdown = Object.values(
    techLogs.reduce((acc, log) => {
      const name = log.profiles?.full_name || 'Unknown'
      const role = log.profiles?.labor_role || null
      const rate = role && rateByRole[role] != null ? rateByRole[role] : blendedLaborRate
      const hrs = log.hours_worked || 0
      if (!acc[name]) acc[name] = { name, role, hrs: 0, cost: 0 }
      acc[name].hrs += hrs
      acc[name].cost += hrs * rate
      return acc
    }, {})
  ).sort((a, b) => b.cost - a.cost)

  // PM true-up form state
  const [showTrueUp, setShowTrueUp] = useState(false)
  const [trueUpType, setTrueUpType] = useState('labor') // 'labor' | 'materials'
  const [trueUpForm, setTrueUpForm] = useState({ role: '', hours: '', matCost: '', matDesc: '', date: new Date().toISOString().slice(0, 10), note: '' })
  const [savingTrueUp, setSavingTrueUp] = useState(false)
  const handleTrueUpSave = async () => {
    setSavingTrueUp(true)
    const role = trueUpForm.role || null
    const rateForRole = role && rateByRole[role] != null ? rateByRole[role] : blendedLaborRate
    if (trueUpType === 'labor') {
      if (!trueUpForm.hours || parseFloat(trueUpForm.hours) <= 0) { setSavingTrueUp(false); return }
      await onAddManualEntry?.({
        hours_worked: parseFloat(trueUpForm.hours),
        log_date: trueUpForm.date,
        notes: trueUpForm.note || null,
        labor_role: role,
        cost_per_hour: rateForRole,
        is_manual_entry: true,
      })
    } else {
      if (!trueUpForm.matCost || parseFloat(trueUpForm.matCost) <= 0) { setSavingTrueUp(false); return }
      const matEntry = [{ id: `adj_${Date.now()}`, name: trueUpForm.matDesc || 'Material adjustment', qty: 1, cost: parseFloat(trueUpForm.matCost) }]
      await onAddManualEntry?.({
        hours_worked: 0,
        log_date: trueUpForm.date,
        notes: trueUpForm.note || null,
        materials_used: JSON.stringify(matEntry),
        is_manual_entry: true,
      })
    }
    setTrueUpForm({ role: '', hours: '', matCost: '', matDesc: '', date: new Date().toISOString().slice(0, 10), note: '' })
    setShowTrueUp(false)
    setSavingTrueUp(false)
  }

  // Push cost report data into the global AI agent context
  useEffect(() => {
    setAIPageContext(`[Job Cost Report — ${job?.job_name || job?.name || 'Current Job'}]
Status: ${job?.status || '—'}
Quoted Revenue: $${fmt(totalRevenue)} | Total Budgeted Cost: $${fmt(totalCost)} | Gross Margin: ${grossMargin}%
${overBudget ? `OVER BUDGET by $${fmt(totalCost - totalRevenue)}` : `Remaining Budget: $${fmt(totalRevenue - totalCost)}`}
Labor — Quoted: $${fmt(laborQuotedRevenue)} | Budgeted Cost: $${fmt(laborBudgetedCost)} | Margin: $${fmt(laborBudgetMargin)} (${laborBudgetMarginPct ?? '—'}%)
Hours: ${hoursLogged.toFixed(1)} logged of ${estimatedHours.toFixed(1)} estimated${laborOver ? ` — OVER by ${(hoursLogged - estimatedHours).toFixed(1)} hrs` : ` — ${(estimatedHours - hoursLogged).toFixed(1)} remaining`}
Projected Labor Margin: $${fmt(laborActualMargin)} (${laborActualMarginPct ?? '—'}%)
Materials — Quoted: $${fmt(quotedMaterials)} | Cost: $${fmt(costMaterials)} | Margin: $${fmt(quotedMaterials - costMaterials)}${freeformPOCost > 0 ? ` | Freeform POs: $${fmt(freeformPOCost)}` : ''}${approvedCOs > 0 ? ` | COs: $${fmt(approvedCOs)}` : ''}
Checklist: ${checklistDone}/${checklistTotal} complete`)
    return () => clearAIPageContext()
  }, [totalRevenue, totalCost, hoursLogged, estimatedHours, laborQuotedRevenue, laborBudgetedCost])

  return (
    <div className="bg-fp-card rounded-xl p-6">
      <div className="flex justify-between items-center mb-5">
        <h3 className="text-fp-text font-bold text-lg">Job Cost Report</h3>
        <button onClick={onExportPDF}
          className="bg-fp-inset text-fp-text px-4 py-2 rounded-lg text-sm hover:bg-fp-hover transition-colors">
          ↓ Export PDF
        </button>
      </div>
      <div className="space-y-5">

        {/* Over-budget banner */}
        {(overBudget || nearBudget) && (
          <div className={`rounded-xl px-5 py-4 flex items-center gap-3 ${overBudget ? 'bg-red-500/10 border border-red-500/30' : 'bg-yellow-500/10 border border-yellow-500/30'}`}>
            <span className="text-2xl">{overBudget ? '🔴' : '🟡'}</span>
            <div>
              <p className={`font-bold text-sm ${overBudget ? 'text-red-400' : 'text-yellow-400'}`}>
                {overBudget
                  ? `Over budget by $${fmt(totalCost - totalRevenue)}`
                  : `Approaching budget limit — ${((totalCost / totalRevenue) * 100).toFixed(0)}% of contract value spent`}
              </p>
              <p className="text-fp-muted text-xs mt-0.5">
                Contract value: ${fmt(totalRevenue)} · Total cost: ${fmt(totalCost)} · Remaining: ${overBudget ? '-' : ''}${fmt(Math.abs(totalRevenue - totalCost))}
              </p>
            </div>
          </div>
        )}
        {!overBudget && !nearBudget && totalRevenue > 0 && (
          <div className="rounded-xl px-5 py-3 flex items-center gap-3 bg-green-500/10 border border-green-500/20">
            <span className="text-xl">🟢</span>
            <p className="text-green-400 text-sm font-medium">On budget — ${fmt(totalRevenue - totalCost)} remaining ({((1 - totalCost / totalRevenue) * 100).toFixed(0)}% of contract value)</p>
          </div>
        )}

        {/* Job Progress */}
        <div className="bg-fp-inset rounded-xl p-5 space-y-4">
          <p className="text-fp-text font-semibold text-sm">Job Progress</p>
          {[
            { label: 'Materials Used', pct: materialsPct, detail: totalPlannedUnits > 0 ? `${totalUsedUnits} of ${totalPlannedUnits} units${materialsOver ? ` (+${(totalUsedUnits - totalPlannedUnits).toFixed(1)} over)` : ''}` : 'No materials logged', over: materialsOver, color: materialsOver ? 'bg-red-500' : 'bg-[#C8622A]' },
            { label: 'Labor Hours', pct: laborPct, detail: estimatedHours > 0 ? `${hoursLogged.toFixed(1)} of ${estimatedHours.toFixed(1)} hrs est.${laborOver ? ` (+${(hoursLogged - estimatedHours).toFixed(1)} over)` : ''}` : `${hoursLogged.toFixed(1)} hrs logged (no estimate)`, over: laborOver, color: laborOver ? 'bg-red-500' : 'bg-blue-500' },
            { label: 'Checklist', pct: checklistPct, detail: `${checklistDone} of ${checklistTotal} items complete`, over: false, color: 'bg-green-500' },
            { label: 'Cost Burned', pct: costBurnPct, detail: totalCost > 0 ? `$${fmt(actualCostTotal)} of $${fmt(totalCost)} budgeted` : 'No cost data', over: actualCostTotal > totalCost, color: actualCostTotal > totalCost ? 'bg-red-500' : 'bg-purple-500' },
          ].map(({ label, pct, detail, over, color }) => (
            <div key={label}>
              <div className="flex justify-between items-baseline mb-1">
                <span className="text-fp-muted text-xs">{label}</span>
                <span className={`text-xs font-semibold ${over ? 'text-red-400' : 'text-fp-text'}`}>{pct.toFixed(0)}%{over ? ' ⚠' : ''}</span>
              </div>
              <div className="w-full bg-fp-card rounded-full h-2 mb-1">
                <div className={`h-2 rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
              </div>
              <p className={`text-xs ${over ? 'text-red-400' : 'text-fp-muted'}`}>{detail}</p>
            </div>
          ))}
        </div>

        {/* Job Profitability */}
        <div className="bg-fp-inset rounded-xl p-5">
          <p className="text-fp-text font-semibold text-sm mb-4">Job Profitability</p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 mb-4">
            <div>
              <p className="text-fp-muted text-xs mb-1">Total Revenue</p>
              <p className="text-fp-text font-bold text-xl">${fmt(totalRevenue)}</p>
              {approvedCOs > 0 && <p className="text-[#C8622A] text-xs mt-0.5">incl. ${fmt(approvedCOs)} in COs</p>}
            </div>
            <div>
              <p className="text-fp-muted text-xs mb-1">Total Cost</p>
              <p className="text-fp-text font-bold text-xl">${fmt(totalCost)}</p>
              {freeformPOCost > 0 && <p className="text-blue-400 text-xs mt-0.5">incl. ${fmt(freeformPOCost)} freeform POs</p>}
            </div>
            <div>
              <p className="text-fp-muted text-xs mb-1">Gross Profit</p>
              <p className={`font-bold text-xl ${totalRevenue - totalCost >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                {totalRevenue - totalCost < 0 ? '-' : '+'}${fmt(Math.abs(totalRevenue - totalCost))}
              </p>
            </div>
            <div>
              <p className="text-fp-muted text-xs mb-1">Gross Margin</p>
              <p className={`font-bold text-xl ${parseFloat(grossMargin) >= 30 ? 'text-green-400' : parseFloat(grossMargin) >= 15 ? 'text-[#C8622A]' : 'text-red-400'}`}>{grossMargin}%</p>
            </div>
          </div>
          {/* Category breakdown */}
          <div className="space-y-2">
            {[
              { label: 'Materials', revenue: quotedMaterials, cost: costMaterials },
              ...(quotedLabor > 0 ? [{ label: 'Labor', revenue: quotedLabor, cost: costLabor }] : []),
              ...(approvedCOs > 0 ? [{ label: 'Change Orders', revenue: approvedCOs, cost: costCOs }] : []),
              ...(freeformPOCost > 0 ? [{ label: 'Freeform POs', revenue: 0, cost: freeformPOCost }] : []),
            ].map(({ label, revenue, cost }) => {
              const profit = revenue - cost
              const pct = revenue > 0 ? (profit / revenue * 100).toFixed(1) : null
              const barPct = totalRevenue > 0 ? Math.min((revenue / totalRevenue) * 100, 100) : 0
              return (
                <div key={label} className="flex items-center gap-3 text-xs">
                  <span className="text-fp-muted w-28 shrink-0">{label}</span>
                  <div className="flex-1 bg-fp-card rounded-full h-1.5 min-w-0">
                    <div className="h-1.5 rounded-full bg-[#C8622A]/60" style={{ width: `${barPct}%` }} />
                  </div>
                  <span className="text-fp-muted w-24 text-right shrink-0">${fmt(revenue)} rev</span>
                  <span className="text-fp-muted w-24 text-right shrink-0">${fmt(cost)} cost</span>
                  <span className={`w-28 text-right font-semibold shrink-0 ${profit >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {profit >= 0 ? '+' : ''}${fmt(profit)}{pct !== null ? ` (${pct}%)` : ''}
                  </span>
                </div>
              )
            })}
          </div>
          <div className="border-t border-fp-border/50 mt-3 pt-3 flex items-center gap-3 text-xs">
            <span className="text-fp-text font-semibold w-28 shrink-0">Total</span>
            <div className="flex-1" />
            <span className="text-fp-text font-semibold w-24 text-right shrink-0">${fmt(totalRevenue)}</span>
            <span className="text-fp-text font-semibold w-24 text-right shrink-0">${fmt(totalCost)}</span>
            <span className={`w-28 text-right font-bold shrink-0 ${totalRevenue - totalCost >= 0 ? 'text-green-400' : 'text-red-400'}`}>
              {totalRevenue - totalCost >= 0 ? '+' : ''}${fmt(totalRevenue - totalCost)} ({grossMargin}%)
            </span>
          </div>
        </div>

        {/* Hours logged card */}
        <div className="bg-fp-inset rounded-xl px-5 py-4 flex items-center justify-between">
          <p className="text-fp-muted text-sm">Hours Logged</p>
          <p className="text-fp-text font-bold text-xl">{hoursLogged.toFixed(1)} hrs</p>
        </div>

        {/* Breakdown table */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-fp-border">
                <th className="text-fp-muted text-left py-2 font-normal">Category</th>
                <th className="text-fp-muted text-right py-2 pr-4 font-normal">Revenue (Customer)</th>
                <th className="text-fp-muted text-right py-2 pr-4 font-normal">Your Cost</th>
                <th className="text-fp-muted text-right py-2 font-normal">Margin $</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={i} className="border-b border-fp-border/50">
                  <td className={`py-3 ${row.color}`}>{row.label}</td>
                  <td className="text-fp-text py-3 pr-4 text-right">{row.quoted > 0 ? `$${fmt(row.quoted)}` : '—'}</td>
                  <td className="text-fp-text py-3 pr-4 text-right">${fmt(row.cost)}</td>
                  <td className={`py-3 text-right font-semibold ${row.quoted - row.cost >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {row.quoted > 0 ? `$${fmt(row.quoted - row.cost)}` : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-fp-border">
                <td className="text-fp-text pt-3 font-bold">Total</td>
                <td className="text-fp-text pt-3 pr-4 text-right font-bold">${fmt(totalRevenue)}</td>
                <td className="text-fp-text pt-3 pr-4 text-right font-bold">${fmt(totalCost)}</td>
                <td className="text-green-400 pt-3 text-right font-bold">${fmt(totalRevenue - totalCost)}</td>
              </tr>
            </tfoot>
          </table>
        </div>

        {/* Materials breakdown */}
        {lineItems.length > 0 && (
          <div>
            <p className="text-fp-muted text-xs font-semibold uppercase tracking-wide mb-3">Materials — Line Item Detail</p>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-fp-border">
                    {['Item', 'Vendor', 'Planned', 'Used', 'Remaining', 'Your Cost', 'Customer Price', 'Margin $', 'Margin %'].map(h => (
                      <th key={h} className="text-fp-muted text-left py-2 pr-3 font-normal">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {lineItems.map(item => {
                    const planned = parseFloat(item.quantity) || 0
                    const used = usedByItemId[item.id] || 0
                    const remaining = planned - used
                    const cost = (item.your_cost_unit || 0) * planned
                    const revenue = item.customer_price_total || 0
                    const margin = revenue - cost
                    const marginPct = revenue > 0 ? ((margin / revenue) * 100).toFixed(1) : '—'
                    const isOver = used > 0 && remaining < 0
                    const isLow = !isOver && used > 0 && planned > 0 && remaining / planned < 0.2
                    return (
                      <tr key={item.id} className="border-b border-fp-border/30">
                        <td className="text-fp-text py-2 pr-3 font-medium">{item.item_name}</td>
                        <td className="text-fp-muted py-2 pr-3">{item.vendor || '—'}</td>
                        <td className="text-fp-text py-2 pr-3">{planned} {item.unit}</td>
                        <td className="py-2 pr-3">{used > 0 ? <span className="text-[#C8622A] font-semibold">{used} {item.unit}</span> : <span className="text-fp-muted">—</span>}</td>
                        <td className="py-2 pr-3">
                          {used === 0 ? <span className="text-fp-muted">—</span>
                            : isOver ? <span className="text-red-400 font-semibold">{Math.abs(remaining).toFixed(1)} over ⚠</span>
                            : isLow ? <span className="text-yellow-400 font-semibold">{remaining.toFixed(1)} left ↓</span>
                            : <span className="text-green-400">{remaining.toFixed(1)} left</span>}
                        </td>
                        <td className="text-fp-text py-2 pr-3">${fmt(cost)}</td>
                        <td className="text-fp-text py-2 pr-3">${fmt(revenue)}</td>
                        <td className={`py-2 pr-3 font-semibold ${margin >= 0 ? 'text-green-400' : 'text-red-400'}`}>${fmt(margin)}</td>
                        <td className={`py-2 font-semibold ${margin >= 0 ? 'text-green-400' : 'text-red-400'}`}>{marginPct}{marginPct !== '—' ? '%' : ''}</td>
                      </tr>
                    )
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t border-fp-border">
                    <td colSpan="5" className="text-fp-muted pt-2 font-semibold">Totals</td>
                    <td className="text-fp-text pt-2 font-semibold pr-3">${fmt(lineItems.reduce((s, i) => s + ((i.your_cost_unit || 0) * (i.quantity || 0)), 0))}</td>
                    <td className="text-fp-text pt-2 font-semibold pr-3">${fmt(lineItems.reduce((s, i) => s + (i.customer_price_total || 0), 0))}</td>
                    <td className="text-green-400 pt-2 font-semibold pr-3">${fmt(lineItems.reduce((s, i) => s + ((i.customer_price_total || 0) - ((i.your_cost_unit || 0) * (i.quantity || 0))), 0))}</td>
                    <td></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        )}

        {/* Labor detail */}
        {allLaborItems.length > 0 && (
          <div>
            <p className="text-fp-muted text-xs font-semibold uppercase tracking-wide mb-3">Labor — Line Item Detail</p>
            {/* Labor hours + profitability */}
            <div className="grid grid-cols-2 gap-3 mb-4 sm:grid-cols-4">
              <div className="bg-fp-inset rounded-lg px-4 py-3">
                <p className="text-fp-muted text-xs mb-1">Quoted Revenue</p>
                <p className="text-fp-text font-bold text-sm">${fmt(laborQuotedRevenue)}</p>
              </div>
              <div className={`rounded-lg px-4 py-3 ${laborCostOverage > 0 && hoursLogged > 0 ? 'bg-red-500/10 border border-red-500/20' : 'bg-fp-inset'}`}>
                <p className="text-fp-muted text-xs mb-1">Budgeted Cost</p>
                <p className="text-fp-text font-bold text-sm">${fmt(laborBudgetedCost)}</p>
                {hoursLogged > 0 && Math.abs(laborCostOverage) > 0.01 && (
                  <p className={`text-xs mt-0.5 font-semibold ${laborCostOverage > 0 ? 'text-red-400' : 'text-green-400'}`}>
                    {laborCostOverage > 0 ? `+$${fmt(laborCostOverage)} over budget` : `-$${fmt(Math.abs(laborCostOverage))} under budget`}
                  </p>
                )}
                {laborBudgetMarginPct !== null && (
                  <p className="text-fp-muted text-xs mt-0.5">{laborBudgetMarginPct}% quoted margin</p>
                )}
              </div>
              <div className={`rounded-lg px-4 py-3 ${laborOver ? 'bg-red-500/10 border border-red-500/20' : 'bg-fp-inset'}`}>
                <p className="text-fp-muted text-xs mb-1">Hours {laborOver ? 'Over' : 'Remaining'}</p>
                <p className={`font-bold text-sm ${laborOver ? 'text-red-400' : 'text-green-400'}`}>
                  {laborOver ? '+' : ''}{Math.abs(estimatedHours - hoursLogged).toFixed(1)} hrs{laborOver ? ' ⚠' : ''}
                </p>
                <p className="text-fp-muted text-xs mt-0.5">{hoursLogged.toFixed(1)} of {estimatedHours.toFixed(1)} logged</p>
              </div>
              <div className={`rounded-lg px-4 py-3 ${laborActualMargin < 0 ? 'bg-red-500/10 border border-red-500/20' : laborActualMargin < laborBudgetMargin * 0.8 ? 'bg-yellow-500/10 border border-yellow-500/20' : 'bg-green-500/10 border border-green-500/20'}`}>
                <p className="text-fp-muted text-xs mb-1">Projected Profit</p>
                <p className={`font-bold text-sm ${laborActualMargin < 0 ? 'text-red-400' : laborActualMargin < laborBudgetMargin * 0.8 ? 'text-yellow-400' : 'text-green-400'}`}>
                  {laborActualMargin < 0 ? '' : '+'}${fmt(laborActualMargin)}
                </p>
                {laborActualMarginPct !== null && (
                  <p className={`text-xs mt-0.5 ${laborActualMargin < 0 ? 'text-red-400' : 'text-fp-muted'}`}>{laborActualMarginPct}% margin</p>
                )}
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-fp-border">
                    {['Role', 'Section', 'Planned Hrs', 'Your Cost/hr', 'Customer Price', 'Margin $', 'Margin %'].map(h => (
                      <th key={h} className="text-fp-muted text-left py-2 pr-3 font-normal">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {allLaborItems.map((l, i) => {
                    const costPerUnit = parseFloat(l.your_cost) || 0
                    const qty = parseFloat(l.quantity) || 0
                    const totalCostRow = costPerUnit * qty
                    const revenue = parseFloat(l.customer_price) || 0
                    const margin = revenue - totalCostRow
                    const marginPct = revenue > 0 ? ((margin / revenue) * 100).toFixed(1) : '—'
                    return (
                      <tr key={i} className="border-b border-fp-border/30">
                        <td className="text-fp-text py-2 pr-3 font-medium">{l.role || '—'}</td>
                        <td className="text-fp-muted py-2 pr-3">{l._sectionName || '—'}</td>
                        <td className="text-fp-text py-2 pr-3">{qty > 0 ? `${qty} ${l.unit || 'hr'}` : '—'}</td>
                        <td className="text-fp-text py-2 pr-3">${fmt(costPerUnit)}</td>
                        <td className="text-fp-text py-2 pr-3">${fmt(revenue)}</td>
                        <td className={`py-2 pr-3 font-semibold ${margin >= 0 ? 'text-green-400' : 'text-red-400'}`}>${fmt(margin)}</td>
                        <td className={`py-2 font-semibold ${margin >= 0 ? 'text-green-400' : 'text-red-400'}`}>{marginPct}{marginPct !== '—' ? '%' : ''}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {/* Per-tech hours & cost breakdown */}
            {techBreakdown.length > 0 && (
              <div className="mt-4">
                <p className="text-fp-muted text-xs font-semibold uppercase tracking-wide mb-2">Logged Hours by Tech</p>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-fp-border">
                        {['Tech', 'Role', 'Hours Logged', 'Rate/hr', 'Actual Cost', 'vs Budget'].map(h => (
                          <th key={h} className="text-fp-muted text-left py-1.5 pr-3 font-normal">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {techBreakdown.map((t, i) => {
                        // Find planned hours for this role across labor items
                        const plannedHrs = allLaborItems.filter(l => l.role === t.role).reduce((s, l) => s + (parseFloat(l.quantity) || 0), 0)
                        const plannedCost = allLaborItems.filter(l => l.role === t.role).reduce((s, l) => s + ((parseFloat(l.your_cost) || 0) * (parseFloat(l.quantity) || 0)), 0)
                        const costDelta = plannedCost > 0 ? t.cost - plannedCost : null
                        const usingBlended = !t.role || rateByRole[t.role] == null
                        return (
                          <tr key={i} className="border-b border-fp-border/30">
                            <td className="text-fp-text py-2 pr-3 font-medium">{t.name}</td>
                            <td className="py-2 pr-3">
                              {t.role
                                ? <span className="text-fp-muted">{t.role}</span>
                                : <span className="text-yellow-400 text-[10px]">No role set</span>}
                            </td>
                            <td className="text-fp-text py-2 pr-3 font-variant-numeric tabular-nums">{t.hrs.toFixed(1)} hrs</td>
                            <td className="text-fp-muted py-2 pr-3">
                              ${fmt(usingBlended ? blendedLaborRate : rateByRole[t.role])}
                              {usingBlended && <span className="text-yellow-400 text-[10px] ml-1">blended</span>}
                            </td>
                            <td className="text-fp-text py-2 pr-3 font-semibold">${fmt(t.cost)}</td>
                            <td className="py-2 pr-3">
                              {costDelta === null
                                ? <span className="text-fp-muted">—</span>
                                : costDelta > 0.01
                                  ? <span className="text-red-400 font-semibold">+${fmt(costDelta)} over</span>
                                  : costDelta < -0.01
                                    ? <span className="text-green-400">-${fmt(Math.abs(costDelta))} under</span>
                                    : <span className="text-green-400">on budget</span>}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                    <tfoot>
                      <tr className="border-t border-fp-border">
                        <td colSpan="2" className="text-fp-muted pt-2 font-semibold">Total</td>
                        <td className="text-fp-text pt-2 pr-3 font-semibold">{hoursLogged.toFixed(1)} hrs</td>
                        <td></td>
                        <td className="text-fp-text pt-2 pr-3 font-semibold">${fmt(laborActualCost)}</td>
                        <td className="pt-2">
                          {hoursLogged > 0 && Math.abs(laborCostOverage) > 0.01 && (
                            <span className={`font-semibold text-xs ${laborCostOverage > 0 ? 'text-red-400' : 'text-green-400'}`}>
                              {laborCostOverage > 0 ? `+$${fmt(laborCostOverage)} over` : `-$${fmt(Math.abs(laborCostOverage))} under`}
                            </span>
                          )}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {/* PM Labor True-Up */}
        {onAddManualEntry && (
          <div>
            <div className="flex items-center justify-between mb-3">
              <p className="text-fp-muted text-xs font-semibold uppercase tracking-wide">PM Labor True-Up</p>
              <button onClick={() => setShowTrueUp(v => !v)} className="text-[#C8622A] text-xs hover:text-fp-text transition-colors">
                {showTrueUp ? 'Cancel' : '+ Add Manual Hours'}
              </button>
            </div>
            {showTrueUp && (
              <div className="bg-fp-inset rounded-xl p-4 space-y-3">
                <p className="text-fp-muted text-xs">Add cost directly without a tech daily log — use to true-up hours or materials the PM managed.</p>
                <div className="flex gap-2">
                  {['labor', 'materials'].map(t => (
                    <button key={t} onClick={() => setTrueUpType(t)}
                      className={`px-3 py-1 rounded-lg text-xs font-semibold transition-colors ${trueUpType === t ? 'bg-[#C8622A] text-white' : 'bg-fp-card text-fp-muted hover:text-fp-text border border-fp-border'}`}>
                      {t === 'labor' ? 'Labor Hours' : 'Materials Cost'}
                    </button>
                  ))}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  {trueUpType === 'labor' ? (
                    <>
                      <div>
                        <label className="text-fp-muted text-xs mb-1 block">Role</label>
                        <select value={trueUpForm.role} onChange={e => setTrueUpForm(p => ({ ...p, role: e.target.value }))}
                          className="w-full bg-fp-card text-fp-text border border-fp-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-fp-brand">
                          <option value="">— Blended rate —</option>
                          {laborRates.map(r => <option key={r.role} value={r.role}>{r.role} (${fmt(r.cost_per_hour)}/hr)</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="text-fp-muted text-xs mb-1 block">Hours <span className="text-[#C8622A]">*</span></label>
                        <input type="number" min="0.25" step="0.25" placeholder="0.0"
                          value={trueUpForm.hours} onChange={e => setTrueUpForm(p => ({ ...p, hours: e.target.value }))}
                          className="w-full bg-fp-card text-fp-text border border-fp-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-fp-brand" />
                      </div>
                    </>
                  ) : (
                    <>
                      <div>
                        <label className="text-fp-muted text-xs mb-1 block">Description</label>
                        <input type="text" placeholder="e.g. Extra conduit, misc hardware"
                          value={trueUpForm.matDesc} onChange={e => setTrueUpForm(p => ({ ...p, matDesc: e.target.value }))}
                          className="w-full bg-fp-card text-fp-text border border-fp-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-fp-brand" />
                      </div>
                      <div>
                        <label className="text-fp-muted text-xs mb-1 block">Cost ($) <span className="text-[#C8622A]">*</span></label>
                        <input type="number" min="0.01" step="0.01" placeholder="0.00"
                          value={trueUpForm.matCost} onChange={e => setTrueUpForm(p => ({ ...p, matCost: e.target.value }))}
                          className="w-full bg-fp-card text-fp-text border border-fp-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-fp-brand" />
                      </div>
                    </>
                  )}
                  <div>
                    <label className="text-fp-muted text-xs mb-1 block">Date</label>
                    <input type="date" value={trueUpForm.date} onChange={e => setTrueUpForm(p => ({ ...p, date: e.target.value }))}
                      className="w-full bg-fp-card text-fp-text border border-fp-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-fp-brand" />
                  </div>
                  <div>
                    <label className="text-fp-muted text-xs mb-1 block">Note (optional)</label>
                    <input type="text" placeholder="e.g. PM time, site coordination"
                      value={trueUpForm.note} onChange={e => setTrueUpForm(p => ({ ...p, note: e.target.value }))}
                      className="w-full bg-fp-card text-fp-text border border-fp-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-fp-brand" />
                  </div>
                </div>
                <div className="flex gap-2 justify-end">
                  <button onClick={() => setShowTrueUp(false)} className="text-fp-muted text-sm hover:text-fp-text transition-colors px-3 py-1.5">Cancel</button>
                  <button onClick={handleTrueUpSave} disabled={savingTrueUp || (trueUpType === 'labor' ? !trueUpForm.hours || parseFloat(trueUpForm.hours) <= 0 : !trueUpForm.matCost || parseFloat(trueUpForm.matCost) <= 0)}
                    className="bg-[#C8622A] text-white px-4 py-1.5 rounded-lg text-sm font-semibold hover:bg-[#b5571f] transition-colors disabled:opacity-50">
                    {savingTrueUp ? 'Saving...' : trueUpType === 'labor' ? 'Add Hours' : 'Add Cost'}
                  </button>
                </div>
              </div>
            )}
            {techLogs.filter(l => l.is_manual_entry).length > 0 && (
              <div className="mt-3 overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-fp-border">
                      {['Date', 'Type', 'Detail', 'Amount', 'Note'].map(h => (
                        <th key={h} className="text-fp-muted text-left py-1.5 pr-3 font-normal">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {techLogs.filter(l => l.is_manual_entry).map((l, i) => {
                      const isMat = l.hours_worked === 0 && l.materials_used
                      let matAdj = null
                      if (isMat) { try { const p = JSON.parse(l.materials_used); matAdj = p?.find(m => m.id?.startsWith('adj_')) } catch {} }
                      return (
                        <tr key={i} className="border-b border-fp-border/30">
                          <td className="text-fp-muted py-1.5 pr-3">{l.log_date || '—'}</td>
                          <td className="py-1.5 pr-3">
                            <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${isMat ? 'bg-blue-500/20 text-blue-400' : 'bg-purple-500/20 text-purple-400'}`}>
                              {isMat ? 'Materials' : 'Labor'}
                            </span>
                          </td>
                          <td className="text-fp-text py-1.5 pr-3">{isMat ? (matAdj?.name || '—') : (l.labor_role || 'Blended')}</td>
                          <td className="text-fp-text py-1.5 pr-3">
                            {isMat
                              ? (matAdj ? `$${fmt(matAdj.cost)}` : '—')
                              : `${l.hours_worked} hrs${l.cost_per_hour != null ? ` @ $${fmt(l.cost_per_hour)}/hr` : ''}`
                            }
                          </td>
                          <td className="text-fp-muted py-1.5">{l.notes || '—'}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Freeform PO line items */}
        {freeformPOItems.length > 0 && (
          <div>
            <p className="text-fp-muted text-xs font-semibold uppercase tracking-wide mb-3">Freeform PO Line Items</p>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-fp-border">
                    {['PO #', 'Vendor', 'Description', 'Item', 'Qty', 'Unit Cost', 'Total'].map(h => (
                      <th key={h} className="text-fp-muted text-left py-2 pr-3 font-normal">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {freeformPOItems.map((l, i) => (
                    <tr key={i} className="border-b border-fp-border/30">
                      <td className="text-fp-text py-2 pr-3 font-mono">{l.purchase_orders?.po_number || '—'}</td>
                      <td className="text-fp-muted py-2 pr-3">{l.purchase_orders?.vendor_name || '—'}</td>
                      <td className="text-fp-muted py-2 pr-3">{l.purchase_orders?.description || '—'}</td>
                      <td className="text-fp-text py-2 pr-3 font-medium">{l.item_name}</td>
                      <td className="text-fp-text py-2 pr-3">{l.quantity} {l.unit || ''}</td>
                      <td className="text-fp-text py-2 pr-3">${fmt(l.unit_cost)}</td>
                      <td className="text-blue-400 py-2 font-semibold">${fmt(l.total)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t border-fp-border">
                    <td colSpan="6" className="text-fp-muted pt-2 font-semibold">Freeform PO Total</td>
                    <td className="text-blue-400 pt-2 font-bold">${fmt(freeformPOCost)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        )}

        {/* Change orders detail */}
        {changeOrders.length > 0 && (
          <div className="space-y-4">
            <p className="text-fp-muted text-xs font-semibold uppercase tracking-wide">Change Orders</p>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-fp-border">
                    {['Name', 'Status', 'Amount', 'Your Cost', 'Margin $'].map(h => (
                      <th key={h} className="text-fp-muted text-left py-2 pr-3 font-normal">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {changeOrders.map(co => {
                    const coCost = co.your_cost != null
                      ? parseFloat(co.your_cost)
                      : (co.line_items || []).reduce((s, l) => s + ((parseFloat(l.your_cost_unit) || 0) * (parseFloat(l.quantity) || 0)), 0) + (co.labor_items || []).reduce((s, l) => s + ((parseFloat(l.your_cost) || 0) * (parseFloat(l.quantity) || 0)), 0)
                    const hasCost = co.your_cost != null || (co.line_items || []).length > 0 || (co.labor_items || []).length > 0
                    const coMargin = co.amount - coCost
                    return (
                      <tr key={co.id} className="border-b border-fp-border/30">
                        <td className="text-fp-text py-2 pr-3">{co.name}</td>
                        <td className="py-2 pr-3">
                          <span className={`px-2 py-0.5 rounded text-xs font-semibold ${co.status === 'Approved' ? 'bg-green-500/20 text-green-400' : co.status === 'Rejected' ? 'bg-red-500/20 text-red-400' : 'bg-yellow-500/20 text-yellow-400'}`}>
                            {co.status}
                          </span>
                        </td>
                        <td className="text-[#C8622A] py-2 pr-3 font-semibold">${fmt(co.amount)}</td>
                        <td className="text-fp-text py-2 pr-3">{hasCost ? `$${fmt(coCost)}` : '—'}</td>
                        <td className={`py-2 font-semibold ${coMargin >= 0 ? 'text-green-400' : 'text-red-400'}`}>{hasCost ? `$${fmt(coMargin)}` : '—'}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

      </div>
    </div>
  )
}
