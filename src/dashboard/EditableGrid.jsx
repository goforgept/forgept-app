// Widget grid. In edit mode cards can be dragged to a new spot (mouse, touch or keyboard)
// and resized by dragging their right edge; widths snap to the sizes each widget allows.
import { Component, useRef, useState } from 'react'
import { DndContext, DragOverlay, KeyboardSensor, PointerSensor, TouchSensor, closestCenter, useSensor, useSensors } from '@dnd-kit/core'
import { SortableContext, arrayMove, horizontalListSortingStrategy, rectSortingStrategy, sortableKeyboardCoordinates, useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { WIDGETS, SIZES } from './registry'

export const SPAN = {
  3: 'col-span-12 sm:col-span-6 xl:col-span-3',
  4: 'col-span-12 md:col-span-6 xl:col-span-4',
  6: 'col-span-12 xl:col-span-6',
  8: 'col-span-12 xl:col-span-8',
  12: 'col-span-12',
}
const GAP = 16 // matches gap-4

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

function useDragSensors() {
  return useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )
}

const GripIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <circle cx="9" cy="6" r="1.6" /><circle cx="15" cy="6" r="1.6" /><circle cx="9" cy="12" r="1.6" /><circle cx="15" cy="12" r="1.6" /><circle cx="9" cy="18" r="1.6" /><circle cx="15" cy="18" r="1.6" />
  </svg>
)

function SortableWidget({ w, gridRef, onResize, onRemove }) {
  const def = WIDGETS[w.type]
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: w.i })
  const [preview, setPreview] = useState(null) // width while resizing
  const width = preview ?? w.w

  // Drag the right edge: convert pixels to grid columns, snap to the widget's allowed sizes
  const startResize = (e) => {
    e.preventDefault(); e.stopPropagation()
    const grid = gridRef.current
    if (!grid) return
    const col = (grid.clientWidth - GAP * 11) / 12
    const card = e.currentTarget.parentElement.getBoundingClientRect()
    const startX = e.clientX
    const snap = (px) => {
      const cols = (px + GAP) / (col + GAP)
      return def.sizes.reduce((best, s) => Math.abs(s - cols) < Math.abs(best - cols) ? s : best, def.sizes[0])
    }
    let last = w.w
    const move = (ev) => { last = snap(card.width + ev.clientX - startX); setPreview(last) }
    const up = () => {
      window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up)
      setPreview(null)
      if (last !== w.w) onResize(w.i, last)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }
  const Comp = def.component

  return (
    <div ref={setNodeRef} className={`${SPAN[width] || SPAN[12]} min-w-0 relative`}
      style={{ transform: CSS.Translate.toString(transform), transition, zIndex: isDragging ? 30 : undefined }}>
      <div className={`h-full min-h-[110px] transition-opacity ${isDragging ? 'opacity-30' : ''}`} aria-hidden="true">
        <div className="h-full pointer-events-none select-none"><WidgetBoundary type={w.type}><Comp /></WidgetBoundary></div>
      </div>

      {/* Edit chrome: the whole card is the drag handle */}
      <div ref={setActivatorNodeRef} {...listeners} {...attributes} aria-label={`Move ${def.title}`}
        className="absolute inset-0 rounded-2xl border-2 border-dashed border-fp-brand/60 bg-fp-bg/10 hover:bg-fp-brand/5 cursor-grab active:cursor-grabbing touch-none focus:outline-none focus-visible:ring-2 focus-visible:ring-fp-brand">
        <span className="absolute top-2 left-2 inline-flex items-center gap-1.5 bg-fp-card border border-fp-border text-fp-text text-xs font-semibold rounded-lg pl-1.5 pr-2.5 py-1 shadow">
          <span className="text-fp-muted"><GripIcon /></span>{def.title}
          {def.sizes.length > 1 && <span className="text-fp-muted font-normal">· {SIZES[width]}</span>}
        </span>
      </div>
      <button onClick={() => onRemove(w.i)} onPointerDown={e => e.stopPropagation()} aria-label={`Remove ${def.title}`}
        className="absolute top-2 right-2 w-7 h-7 grid place-items-center rounded-lg bg-fp-card border border-fp-border text-fp-muted hover:text-red-500 hover:border-red-500/50 shadow">✕</button>
      {def.sizes.length > 1 && (
        <div onPointerDown={startResize} role="separator" aria-orientation="vertical" aria-label={`Resize ${def.title}`} title="Drag to resize"
          className="hidden xl:flex absolute top-0 bottom-0 -right-2 w-4 cursor-ew-resize items-center justify-center group touch-none">
          <span className="w-1.5 h-12 rounded-full bg-fp-brand/70 group-hover:bg-fp-brand shadow" />
        </div>
      )}
    </div>
  )
}

export function WidgetGrid({ widgets, editing, onChange }) {
  const gridRef = useRef(null)
  const sensors = useDragSensors()
  const [activeId, setActiveId] = useState(null)
  const [activeSize, setActiveSize] = useState(null)

  if (!editing) {
    return (
      <div className="grid grid-cols-12 gap-4 items-stretch">
        {widgets.map(w => {
          const Comp = WIDGETS[w.type]?.component
          if (!Comp) return null
          return (
            <div key={w.i} className={`${SPAN[w.w] || SPAN[12]} min-w-0 empty:hidden`}>
              <WidgetBoundary type={w.type}><Comp /></WidgetBoundary>
            </div>
          )
        })}
      </div>
    )
  }

  const active = widgets.find(w => w.i === activeId)
  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter}
      onDragStart={(e) => { setActiveId(e.active.id); const r = e.active.rect.current.initial; setActiveSize(r ? { w: r.width, h: Math.min(r.height, 220) } : null) }}
      onDragCancel={() => setActiveId(null)}
      onDragEnd={({ active: a, over }) => {
        setActiveId(null)
        if (!over || a.id === over.id) return
        const from = widgets.findIndex(w => w.i === a.id), to = widgets.findIndex(w => w.i === over.id)
        onChange(arrayMove(widgets, from, to))
      }}>
      <SortableContext items={widgets.map(w => w.i)} strategy={rectSortingStrategy}>
        <div ref={gridRef} className="grid grid-cols-12 gap-4 items-stretch">
          {widgets.filter(w => WIDGETS[w.type]).map(w => (
            <SortableWidget key={w.i} w={w} gridRef={gridRef}
              onResize={(id, size) => onChange(widgets.map(x => x.i === id ? { ...x, w: size } : x))}
              onRemove={(id) => onChange(widgets.filter(x => x.i !== id))} />
          ))}
        </div>
      </SortableContext>
      <DragOverlay dropAnimation={{ duration: 180 }}>
        {active ? (
          <div className="rounded-2xl border-2 border-fp-brand bg-fp-card shadow-2xl grid place-items-center cursor-grabbing"
            style={{ width: activeSize?.w, height: activeSize?.h || 120 }}>
            <span className="inline-flex items-center gap-2 text-fp-text text-sm font-semibold"><span className="text-fp-muted"><GripIcon /></span>{WIDGETS[active.type].title}</span>
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  )
}

function SortableTab({ tab, selected, onSelect }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: tab.id })
  return (
    <button ref={setNodeRef} {...attributes} {...listeners} onClick={onSelect}
      style={{ transform: CSS.Translate.toString(transform), transition, zIndex: isDragging ? 10 : undefined }}
      className={`px-4 py-2.5 text-sm font-semibold whitespace-nowrap border-b-2 -mb-px cursor-grab active:cursor-grabbing touch-none inline-flex items-center gap-1.5 ${selected ? 'border-fp-brand text-fp-text' : 'border-transparent text-fp-muted hover:text-fp-text'} ${isDragging ? 'opacity-60' : ''}`}>
      <span className="text-fp-muted"><GripIcon /></span>{tab.name}
    </button>
  )
}

/** Tab bar; in edit mode tabs can be dragged into a new order. */
export function TabBar({ tabs, activeId, onSelect, editing, onReorder }) {
  const sensors = useDragSensors()
  if (!editing) {
    if (tabs.length < 2) return null
    return (
      <div role="tablist" aria-label="Dashboard tabs" className="flex gap-1 border-b border-fp-border overflow-x-auto">
        {tabs.map(t => (
          <button key={t.id} role="tab" aria-selected={t.id === activeId} onClick={() => onSelect(t.id)}
            className={`px-4 py-2.5 text-sm font-semibold whitespace-nowrap border-b-2 -mb-px transition-colors ${t.id === activeId ? 'border-fp-brand text-fp-text' : 'border-transparent text-fp-muted hover:text-fp-text'}`}>
            {t.name}
          </button>
        ))}
      </div>
    )
  }
  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter}
      onDragEnd={({ active, over }) => {
        if (!over || active.id === over.id) return
        onReorder(arrayMove(tabs, tabs.findIndex(t => t.id === active.id), tabs.findIndex(t => t.id === over.id)))
      }}>
      <SortableContext items={tabs.map(t => t.id)} strategy={horizontalListSortingStrategy}>
        <div className="flex gap-1 border-b border-fp-border overflow-x-auto">
          {tabs.map(t => <SortableTab key={t.id} tab={t} selected={t.id === activeId} onSelect={() => onSelect(t.id)} />)}
        </div>
      </SortableContext>
    </DndContext>
  )
}
