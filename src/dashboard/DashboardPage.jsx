// The dashboard page: greeting, today summary, tabs, and a 12-column grid of widgets.
// Rep, admin, sales manager and PM dashboards are all this page with a different default layout.
import { Component, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Sidebar from '../components/Sidebar'
import { supabase } from '../supabase'
import { indexGoals, monthTarget, rangeTarget, yearValue } from '../lib/goals'
import { DashContext } from './context'
import { useDashboardData } from './data'
import { WIDGETS, sourcesFor } from './registry'
import { defaultLayout, normalize, fromLegacy } from './layouts'
import { Greeting, TodayStrip } from './Greeting'
import { CustomizePanel } from './CustomizePanel'
import { Skeleton } from './ui'
import { PERIODS, PERIOD_SHORT, normalizePeriod, splitByPeriod } from './util'

const SPAN = {
  3: 'col-span-12 sm:col-span-6 xl:col-span-3',
  4: 'col-span-12 md:col-span-6 xl:col-span-4',
  6: 'col-span-12 xl:col-span-6',
  8: 'col-span-12 xl:col-span-8',
  12: 'col-span-12',
}

/** One broken widget shouldn't take the whole dashboard down. */
class WidgetBoundary extends Component {
  constructor(p) { super(p); this.state = { failed: false } }
  static getDerivedStateFromError() { return { failed: true } }
  componentDidCatch(e) { console.error('dashboard widget failed:', this.props.type, e) }
  render() {
    if (this.state.failed) return <div className="h-full bg-fp-card border border-fp-border rounded-2xl p-5 text-fp-muted text-sm">{WIDGETS[this.props.type]?.title || 'This widget'} couldn't load.</div>
    return this.props.children
  }
}

const readLS = (k) => { try { return localStorage.getItem(k) } catch { return null } }
const writeLS = (k, v) => { try { localStorage.setItem(k, v) } catch { /* private mode */ } }

/**
 * dashKey: 'rep' | 'team' (which saved layout to use)
 * scope: 'mine' | 'team' (whose proposals)
 * role: 'rep' | 'admin' | 'pm' (which default layout)
 */
export default function DashboardPage({ profile, dashKey, scope, role, sidebarProps, canSetTargets = false, canSeeOps = false, regionScoped = false, initialTab = null }) {
  const navigate = useNavigate()
  const orgType = profile?.organizations?.org_type || sessionStorage.getItem('orgType') || 'integrator'
  const env = useMemo(() => ({ isTeam: scope === 'team', isManufacturer: orgType === 'manufacturer', canSeeOps: canSeeOps && orgType !== 'manufacturer' }), [scope, orgType, canSeeOps])

  // ── Layout: saved per person, else the role default (carrying over old on/off switches) ──
  const [layout, setLayout] = useState(null)
  const [allSaved, setAllSaved] = useState({})
  const [hasLayoutColumn, setHasLayoutColumn] = useState(true)
  const [activeTab, setActiveTabState] = useState(null)
  const [showCustomize, setShowCustomize] = useState(false)
  const [saveState, setSaveState] = useState('idle')
  const saveTimer = useRef(null)

  useEffect(() => {
    if (!profile?.id) return
    let cancelled = false
    ;(async () => {
      let row = null, hasCol = true
      const r1 = await supabase.from('profiles').select('dashboard_layout, dashboard_widgets, dashboard_widgets_admin').eq('id', profile.id).single()
      if (r1.error) {
        hasCol = false
        const r2 = await supabase.from('profiles').select('dashboard_widgets, dashboard_widgets_admin').eq('id', profile.id).single()
        row = r2.data || {}
      } else row = r1.data || {}
      if (cancelled) return
      const saved = row.dashboard_layout && typeof row.dashboard_layout === 'object' ? row.dashboard_layout : {}
      let lay
      if (saved[dashKey]) lay = normalize(saved[dashKey], env)
      else {
        const local = (() => { try { return JSON.parse(readLS(`dashLayout:${dashKey}`) || 'null') } catch { return null } })()
        if (local && !hasCol) lay = normalize(local, env)
        else {
          lay = fromLegacy(defaultLayout(role, env), dashKey === 'rep' ? row.dashboard_widgets : row.dashboard_widgets_admin, dashKey)
          lay.period = normalizePeriod(readLS(dashKey === 'rep' ? 'dashboard_period' : 'adminDashboardPeriod') || 'all')
        }
      }
      lay.period = normalizePeriod(lay.period)
      setHasLayoutColumn(hasCol)
      setAllSaved(saved)
      setLayout(lay)
      const remembered = readLS(`dashTab:${dashKey}`)
      const legacyMode = readLS('dashboardMode') === 'pm' ? 'ops' : null
      const want = initialTab || remembered || legacyMode
      setActiveTabState(lay.tabs.some(t => t.id === want) ? want : lay.tabs[0].id)
    })()
    return () => { cancelled = true }
  }, [profile?.id, dashKey, role, env, initialTab])

  const setActiveTab = (id) => { setActiveTabState(id); writeLS(`dashTab:${dashKey}`, id) }

  const persist = useCallback((next) => {
    clearTimeout(saveTimer.current)
    setSaveState('saving')
    saveTimer.current = setTimeout(async () => {
      writeLS(`dashLayout:${dashKey}`, JSON.stringify(next))
      if (!hasLayoutColumn) { setSaveState('error'); return }
      const merged = { ...allSaved, [dashKey]: next }
      const { error } = await supabase.from('profiles').update({ dashboard_layout: merged }).eq('id', profile.id)
      if (error) { console.error('dashboard layout save:', error.message); setSaveState('error') }
      else { setAllSaved(merged); setSaveState('saved') }
    }, 500)
  }, [allSaved, dashKey, hasLayoutColumn, profile?.id])

  const updateLayout = (next) => { setLayout(next); persist(next) }
  const resetLayout = () => {
    const d = defaultLayout(role, env)
    d.period = layout?.period || 'all'
    updateLayout(d)
    setActiveTab(d.tabs[0].id)
  }

  // ── Data ──
  const needs = useMemo(() => layout ? [...sourcesFor(layout.tabs), 'tasks', 'goals'] : [], [layout])
  const { data, loading, patchProposal } = useDashboardData({ profile, scope, needs: layout ? needs : [], regionScoped })

  const period = layout?.period || 'all'
  const setPeriod = (p) => updateLayout({ ...layout, period: p })

  // ── Derived values every widget can use ──
  const ctx = useMemo(() => {
    const proposals = data.proposals || []
    const split = splitByPeriod(proposals, period)
    const gIdx = indexGoals(data.goals || [])
    const now = new Date(), y = now.getFullYear(), m = now.getMonth()
    const isTeam = scope === 'team'
    const people = (data.profiles || []).map(p => p.id)

    // Company target if one is set, else the sum of the people in view
    const sumOrCompany = (fn) => {
      if (!isTeam) return fn(profile?.id)
      const company = fn(null)
      if (company != null && !data.regionScoped) return company
      const parts = people.map(fn).filter(v => v != null)
      return parts.length ? parts.reduce((a, b) => a + b, 0) : null
    }
    const periodTarget = (metric) => {
      const span = period === 'mtd' ? [m, 1] : period === 'qtd' ? [Math.floor(m / 3) * 3, 3] : period === 'ytd' ? [0, 12] : null
      if (!span) return null
      return sumOrCompany(pid => rangeTarget(gIdx, pid, metric, y, span[0], span[1]))
    }
    const monthTargets = {
      revenue: sumOrCompany(pid => monthTarget(gIdx, pid, 'revenue_won', y, m)),
      deals: sumOrCompany(pid => monthTarget(gIdx, pid, 'deals_won', y, m)),
    }
    const dateRange = ['mtd', 'qtd', 'ytd'].includes(period) ? `&dateRange=${period}` : ''
    return {
      data, loading, scope, isTeam, period, periodShort: PERIOD_SHORT[period], profile, split, orgType,
      canSetTargets, go: navigate, patchProposal,
      proposalsUrl: (status) => `/proposals?status=${status}${dateRange}`,
      periodTarget, monthTargets,
      personMonthTarget: (pid, metric) => monthTarget(gIdx, pid, metric, y, m),
      marginGoal: yearValue(gIdx, isTeam ? null : profile?.id, 'gross_margin_pct', y),
      markAsSent: async (id) => {
        const sent_at = new Date().toISOString()
        const { error } = await supabase.from('proposals').update({ status: 'Sent', sent_at }).eq('id', id)
        if (!error) patchProposal(id, { status: 'Sent', sent_at })
      },
    }
  }, [data, loading, scope, period, profile, orgType, canSetTargets, navigate, patchProposal])

  const tab = layout?.tabs.find(t => t.id === activeTab) || layout?.tabs[0]
  const firstName = (profile?.full_name || '').trim().split(/\s+/)[0]

  return (
    <div className="flex h-screen bg-fp-bg">
      <Sidebar {...sidebarProps} />
      <main className="flex-1 min-w-0 overflow-y-auto">
        <DashContext.Provider value={ctx}>
          <div className="max-w-[1480px] mx-auto px-4 md:px-6 py-6 flex flex-col gap-5">
            <Greeting name={firstName} actions={<>
              <label htmlFor="dash-period" className="sr-only">Period</label>
              <select id="dash-period" value={period} onChange={e => setPeriod(e.target.value)} disabled={!layout}
                className="h-10 bg-fp-card border border-fp-border text-fp-text text-sm font-medium rounded-xl px-3 focus:outline-none focus:border-fp-brand cursor-pointer">
                {Object.entries(PERIODS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </select>
              <button onClick={() => setShowCustomize(true)} disabled={!layout}
                className="h-10 inline-flex items-center gap-2 px-4 rounded-xl border border-fp-border text-fp-text text-sm font-semibold hover:bg-fp-hover transition-colors">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="5" rx="1.5" /><rect x="14" y="12" width="7" height="9" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /></svg>
                Customize
              </button>
              {role !== 'pm' && (
                <button onClick={() => navigate('/new')} className="h-10 px-4 rounded-xl bg-fp-brand text-white text-sm font-semibold hover:opacity-90">+ New proposal</button>
              )}
            </>} />

            {data.regionScoped && <p className="text-fp-muted text-xs -mt-3">Showing your region only</p>}

            <TodayStrip />

            {layout && layout.tabs.length > 1 && (
              <div role="tablist" aria-label="Dashboard tabs" className="flex gap-1 border-b border-fp-border overflow-x-auto">
                {layout.tabs.map(t => (
                  <button key={t.id} role="tab" aria-selected={t.id === tab?.id} onClick={() => setActiveTab(t.id)}
                    className={`px-4 py-2.5 text-sm font-semibold whitespace-nowrap border-b-2 -mb-px transition-colors ${t.id === tab?.id ? 'border-fp-brand text-fp-text' : 'border-transparent text-fp-muted hover:text-fp-text'}`}>
                    {t.name}
                  </button>
                ))}
              </div>
            )}

            {!layout || loading ? (
              <div className="grid grid-cols-12 gap-4">
                <div className="col-span-12"><Skeleton h={96} /></div>
                <div className="col-span-12 xl:col-span-8"><Skeleton h={280} /></div>
                <div className="col-span-12 xl:col-span-4"><Skeleton h={280} /></div>
                <div className="col-span-12 xl:col-span-6"><Skeleton h={220} /></div>
                <div className="col-span-12 xl:col-span-6"><Skeleton h={220} /></div>
              </div>
            ) : tab.widgets.length === 0 ? (
              <div className="bg-fp-card border border-dashed border-fp-border rounded-2xl p-10 text-center">
                <p className="text-fp-text font-semibold">This tab is empty</p>
                <p className="text-fp-muted text-sm mt-1">Add widgets from the library to build it out.</p>
                <button onClick={() => setShowCustomize(true)} className="mt-4 h-9 px-4 rounded-lg bg-fp-brand text-white text-sm font-semibold">Add widgets</button>
              </div>
            ) : (
              <div className="grid grid-cols-12 gap-4 items-stretch">
                {tab.widgets.map(w => {
                  const W = WIDGETS[w.type]?.component
                  if (!W) return null
                  return (
                    <div key={w.i} className={`${SPAN[w.w] || SPAN[12]} min-w-0 empty:hidden`}>
                      <WidgetBoundary type={w.type}><W /></WidgetBoundary>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </DashContext.Provider>
      </main>

      {showCustomize && layout && (
        <CustomizePanel layout={layout} activeTab={tab?.id} setActiveTab={setActiveTab} env={env}
          onChange={updateLayout} onReset={resetLayout} onClose={() => setShowCustomize(false)} saveState={saveState} />
      )}
    </div>
  )
}
