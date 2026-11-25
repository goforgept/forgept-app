// Building blocks every widget uses: card frame, rings, donuts, empty states.
import { useState } from 'react'

/** Standard widget frame. `action` is a { label, onClick } link in the header. */
export function Card({ title, sub, action, right, children, className = '', tone }) {
  const border = tone === 'warn' ? 'border-amber-500/40' : tone === 'bad' ? 'border-red-500/40' : 'border-fp-border'
  return (
    <section className={`h-full bg-fp-card border ${border} rounded-2xl p-5 flex flex-col gap-4 min-w-0 ${className}`}>
      {(title || action || right) && (
        <header className="flex items-start justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            {title && <h2 className="text-fp-text text-[15px] font-semibold leading-tight">{title}</h2>}
            {sub && <p className="text-fp-muted text-xs mt-1">{sub}</p>}
          </div>
          <div className="flex items-center gap-3">
            {right}
            {action && (
              <button onClick={action.onClick} className="text-fp-brand hover:opacity-80 text-[13px] font-medium whitespace-nowrap">
                {action.label} →
              </button>
            )}
          </div>
        </header>
      )}
      {children}
    </section>
  )
}

export const Empty = ({ children }) => <p className="text-fp-muted text-sm py-2">{children}</p>

export const Eyebrow = ({ children }) => (
  <p className="text-fp-muted text-[11px] font-semibold uppercase tracking-[0.06em]">{children}</p>
)

/** Progress ring. pct = 0–100+ (capped at 100 for drawing); center = text inside. */
export function Ring({ pct, color, size = 64, stroke = 4, center, title }) {
  const r = 14, circ = 2 * Math.PI * r
  const shown = Math.max(0, Math.min(100, pct || 0))
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }} title={title}>
      <svg width={size} height={size} viewBox="0 0 36 36" aria-hidden="true" style={{ transform: 'rotate(-90deg)' }}>
        <circle cx="18" cy="18" r={r} fill="none" stroke="var(--fp-inset)" strokeWidth={stroke} />
        {shown > 0 && (
          <circle cx="18" cy="18" r={r} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round"
            strokeDasharray={`${(circ * shown / 100).toFixed(2)} ${circ.toFixed(2)}`} style={{ transition: 'stroke-dasharray .6s ease' }} />
        )}
      </svg>
      {center != null && (
        <span className="absolute inset-0 grid place-items-center text-fp-text font-bold tabular-nums"
          style={{ fontSize: Math.max(11, Math.round(size / 5)) }}>{center}</span>
      )}
    </div>
  )
}

/**
 * Donut chart. segments: [{ key, label, value, color }]. Hovering a segment or legend row highlights it.
 * center: node shown in the hole.
 */
export function Donut({ segments, size = 180, thickness = 16, center, onSelect, ariaLabel }) {
  const [hover, setHover] = useState(null)
  const r = 48, circ = 2 * Math.PI * r
  const total = segments.reduce((s, x) => s + Math.max(0, x.value), 0)
  const gap = segments.filter(s => s.value > 0).length > 1 ? 2.5 : 0
  let cum = 0
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox="0 0 120 120" role="img" aria-label={ariaLabel} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx="60" cy="60" r={r} fill="none" stroke="var(--fp-inset)" strokeWidth={thickness} />
        {total > 0 && segments.map(s => {
          if (s.value <= 0) return null
          const len = circ * s.value / total
          const el = (
            <circle key={s.key || s.label} cx="60" cy="60" r={r} fill="none" stroke={s.color}
              strokeWidth={hover === (s.key || s.label) ? thickness + 3 : thickness}
              strokeDasharray={`${Math.max(len - gap, 0.5).toFixed(2)} ${circ.toFixed(2)}`} strokeDashoffset={(-cum).toFixed(2)}
              opacity={hover && hover !== (s.key || s.label) ? 0.45 : 1}
              style={{ cursor: onSelect ? 'pointer' : 'default', transition: 'opacity .15s, stroke-width .15s' }}
              onMouseEnter={() => setHover(s.key || s.label)} onMouseLeave={() => setHover(null)}
              onClick={onSelect ? () => onSelect(s) : undefined}>
              <title>{s.title || s.label}</title>
            </circle>
          )
          cum += len
          return el
        })}
      </svg>
      {center && <div className="absolute inset-0 grid place-items-center text-center pointer-events-none">{center}</div>}
    </div>
  )
}

/** Legend row used next to donuts. */
export function LegendRow({ color, label, meta, value, onClick }) {
  const Tag = onClick ? 'button' : 'div'
  return (
    <Tag onClick={onClick}
      className={`w-full grid grid-cols-[10px_minmax(0,1fr)_auto_auto] gap-3 items-center py-2 border-t border-fp-border/60 first:border-t-0 text-left ${onClick ? 'hover:bg-fp-hover/50 rounded-md px-1 -mx-1' : ''}`}>
      <span className="w-2.5 h-2.5 rounded-full" style={{ background: color }} />
      <span className="text-fp-text text-sm truncate">{label}</span>
      <span className="text-fp-muted text-xs tabular-nums whitespace-nowrap">{meta}</span>
      <strong className="text-fp-text text-sm font-semibold tabular-nums text-right min-w-[72px]">{value}</strong>
    </Tag>
  )
}

/** Small colored chip (stage, status). */
export function Chip({ color, children }) {
  return (
    <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap"
      style={{ color, background: color + '22' }}>{children}</span>
  )
}

/** Initials square for client / person rows. */
export function Initials({ name, color = '#E07A42' }) {
  const init = (name || '?').split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase()
  return (
    <span className="w-8 h-8 rounded-lg grid place-items-center text-xs font-bold shrink-0" style={{ color, background: color + '22' }} aria-hidden="true">
      {init}
    </span>
  )
}

/** A clickable list row with a title, sub line and right side. */
export function Row({ title, sub, right, onClick, lead }) {
  const Tag = onClick ? 'button' : 'div'
  return (
    <Tag onClick={onClick}
      className={`w-full flex items-center gap-3 text-left rounded-lg px-2 py-2 -mx-2 ${onClick ? 'hover:bg-fp-hover/60 transition-colors' : ''}`}>
      {lead}
      <span className="flex-1 min-w-0">
        <span className="block text-fp-text text-sm font-medium truncate">{title}</span>
        {sub && <span className="block text-fp-muted text-xs truncate">{sub}</span>}
      </span>
      {right && <span className="shrink-0 text-right">{right}</span>}
    </Tag>
  )
}

export const Skeleton = ({ h = 160 }) => <div className="bg-fp-card border border-fp-border rounded-2xl animate-pulse" style={{ height: h }} />
