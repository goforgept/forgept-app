import { useState } from 'react'
import { WIDGETS, CATEGORIES, SIZES, canUse } from './registry'
import { PERIODS } from './util'
import { uid } from './layouts'

/**
 * Side panel for arranging the dashboard: tabs, widget order/size, add/remove, default period.
 * Edits go through onChange(layout); the page saves them.
 */
export function CustomizePanel({ layout, activeTab, setActiveTab, env, onChange, onReset, onClose, saveState }) {
  const [adding, setAdding] = useState(false)
  const tab = layout.tabs.find(t => t.id === activeTab) || layout.tabs[0]
  const setTab = (patch) => onChange({ ...layout, tabs: layout.tabs.map(t => t.id === tab.id ? { ...t, ...patch } : t) })
  const setWidgets = (widgets) => setTab({ widgets })

  const move = (idx, dir) => {
    const ws = [...tab.widgets], j = idx + dir
    if (j < 0 || j >= ws.length) return
    ;[ws[idx], ws[j]] = [ws[j], ws[idx]]
    setWidgets(ws)
  }
  const addTab = () => {
    const t = { id: uid(), name: 'New tab', widgets: [] }
    onChange({ ...layout, tabs: [...layout.tabs, t] })
    setActiveTab(t.id)
    setAdding(true)
  }
  const removeTab = () => {
    if (layout.tabs.length < 2) return
    const rest = layout.tabs.filter(t => t.id !== tab.id)
    onChange({ ...layout, tabs: rest })
    setActiveTab(rest[0].id)
  }
  const onTab = new Set(tab.widgets.map(w => w.type))
  const library = CATEGORIES.map(cat => ({
    cat, items: Object.entries(WIDGETS).filter(([type, d]) => d.category === cat && canUse(type, env)),
  })).filter(g => g.items.length)

  return (
    <div className="fixed inset-0 z-50 flex" role="dialog" aria-label="Customize dashboard">
      <div className="flex-1 bg-black/50" onClick={onClose} />
      <aside className="w-full max-w-sm bg-fp-card border-l border-fp-border flex flex-col shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-fp-border">
          <div>
            <p className="text-fp-text font-bold">Customize dashboard</p>
            <p className="text-fp-muted text-xs mt-0.5">{saveState === 'saving' ? 'Saving…' : saveState === 'error' ? 'Changes apply on this device only until your admin runs the dashboard SQL.' : 'Changes save automatically.'}</p>
          </div>
          <button onClick={onClose} className="text-fp-muted hover:text-fp-text text-sm font-semibold">Done</button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-6">
          {/* Tabs */}
          <section className="flex flex-col gap-2">
            <p className="text-fp-text text-sm font-semibold">Tabs</p>
            <div className="flex flex-wrap gap-1.5">
              {layout.tabs.map(t => (
                <button key={t.id} onClick={() => setActiveTab(t.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${t.id === tab.id ? 'bg-fp-brand text-white' : 'bg-fp-inset text-fp-muted hover:text-fp-text'}`}>{t.name}</button>
              ))}
              {layout.tabs.length < 8 && <button onClick={addTab} className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-dashed border-fp-border text-fp-muted hover:text-fp-text">+ Tab</button>}
            </div>
            <div className="flex gap-2 items-center">
              <label htmlFor="dash-tab-name" className="sr-only">Tab name</label>
              <input id="dash-tab-name" value={tab.name} maxLength={40} onChange={e => setTab({ name: e.target.value })}
                className="flex-1 bg-fp-inset text-fp-text border border-fp-border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-fp-brand" />
              {layout.tabs.length > 1 && <button onClick={removeTab} className="text-red-500 hover:text-red-400 text-xs font-semibold">Delete tab</button>}
            </div>
          </section>

          {/* Period */}
          <section className="flex flex-col gap-2">
            <label htmlFor="dash-default-period" className="text-fp-text text-sm font-semibold">Default period</label>
            <select id="dash-default-period" value={layout.period} onChange={e => onChange({ ...layout, period: e.target.value })}
              className="bg-fp-inset text-fp-text border border-fp-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-fp-brand">
              {Object.entries(PERIODS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
          </section>

          {/* Widgets on this tab */}
          <section className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <p className="text-fp-text text-sm font-semibold">On “{tab.name}”</p>
              <button onClick={() => setAdding(v => !v)} className="text-fp-brand text-xs font-semibold">{adding ? 'Close library' : '+ Add widget'}</button>
            </div>

            {adding && (
              <div className="flex flex-col gap-3 bg-fp-inset rounded-xl p-3">
                {library.map(g => (
                  <div key={g.cat} className="flex flex-col gap-1">
                    <p className="text-fp-muted text-[11px] font-semibold uppercase tracking-[0.06em]">{g.cat}</p>
                    {g.items.map(([type, d]) => (
                      <div key={type} className="flex items-start gap-3 py-1.5">
                        <div className="flex-1 min-w-0">
                          <p className="text-fp-text text-sm font-medium">{d.title}</p>
                          <p className="text-fp-muted text-xs leading-snug">{d.desc}</p>
                        </div>
                        {onTab.has(type)
                          ? <span className="text-fp-muted text-xs pt-0.5 whitespace-nowrap">Added</span>
                          : <button onClick={() => setWidgets([...tab.widgets, { i: uid(), type, w: d.w }])}
                              className="text-xs font-semibold text-fp-brand border border-fp-brand/40 hover:bg-fp-brand hover:text-white rounded-md px-2 py-0.5">Add</button>}
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            )}

            {tab.widgets.length === 0 && <p className="text-fp-muted text-sm">No widgets yet. Add some from the library.</p>}
            <ol className="flex flex-col gap-1.5">
              {tab.widgets.map((w, idx) => {
                const d = WIDGETS[w.type]
                return (
                  <li key={w.i} className="bg-fp-inset rounded-xl px-3 py-2.5 flex flex-col gap-2">
                    <div className="flex items-center gap-2">
                      <span className="flex-1 text-fp-text text-sm font-medium truncate">{d.title}</span>
                      <button onClick={() => move(idx, -1)} disabled={idx === 0} aria-label={`Move ${d.title} up`} className="text-fp-muted hover:text-fp-text disabled:opacity-25 px-1">↑</button>
                      <button onClick={() => move(idx, 1)} disabled={idx === tab.widgets.length - 1} aria-label={`Move ${d.title} down`} className="text-fp-muted hover:text-fp-text disabled:opacity-25 px-1">↓</button>
                      <button onClick={() => setWidgets(tab.widgets.filter(x => x.i !== w.i))} aria-label={`Remove ${d.title}`} className="text-fp-muted hover:text-red-500 px-1">✕</button>
                    </div>
                    {d.sizes.length > 1 && (
                      <div className="flex gap-1" role="group" aria-label={`${d.title} width`}>
                        {d.sizes.map(s => (
                          <button key={s} onClick={() => setWidgets(tab.widgets.map(x => x.i === w.i ? { ...x, w: s } : x))}
                            className={`px-2 py-0.5 rounded text-[11px] font-semibold ${w.w === s ? 'bg-fp-brand text-white' : 'text-fp-muted hover:text-fp-text border border-fp-border'}`}>{SIZES[s]}</button>
                        ))}
                      </div>
                    )}
                  </li>
                )
              })}
            </ol>
          </section>
        </div>

        <div className="px-5 py-4 border-t border-fp-border">
          <button onClick={onReset} className="w-full border border-fp-border text-fp-muted hover:text-fp-text rounded-lg px-4 py-2 text-sm">Reset to the default layout</button>
        </div>
      </aside>
    </div>
  )
}
