import { useRef, useEffect } from 'react'

// Converts stored HTML to plain text for PDF/DOCX rendering.
// Pass-through for legacy plain-text content.
export const htmlToPlain = (html) => {
  if (!html) return ''
  if (!/<[a-z][\s\S]*>/i.test(html)) return html
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<li[^>]*>/gi, '• ')
    .replace(/<\/li>/gi, '\n')
    .replace(/<\/[ou]l>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

// Detects whether a stored value is HTML (new) or plain text (legacy).
const isHtml = (text) => !!text && /<[a-z][\s\S]*>/i.test(text)

// Renders stored content — HTML or legacy plain text — for display in the UI.
export function RichTextDisplay({ text, className = '' }) {
  if (!text) return null
  if (isHtml(text)) {
    return (
      <div
        className={`prose-sm text-fp-muted text-sm leading-relaxed rich-display ${className}`}
        dangerouslySetInnerHTML={{ __html: text }}
      />
    )
  }
  return <p className={`text-fp-muted text-sm leading-relaxed whitespace-pre-wrap ${className}`}>{text}</p>
}

const TOOLBAR = [
  { cmd: 'bold',                label: 'B',   title: 'Bold',           style: 'font-bold' },
  { cmd: 'italic',              label: 'I',   title: 'Italic',         style: 'italic' },
  { cmd: 'underline',           label: 'U',   title: 'Underline',      style: 'underline' },
  { cmd: 'insertUnorderedList', label: '•—',  title: 'Bullet list',    style: '' },
  { cmd: 'insertOrderedList',   label: '1.',  title: 'Numbered list',  style: '' },
]

export default function RichTextEditor({ value, onChange, placeholder, rows = 6 }) {
  const ref = useRef(null)

  // Initialise or reset content only when the element is not focused (user is not typing)
  useEffect(() => {
    if (ref.current && document.activeElement !== ref.current) {
      ref.current.innerHTML = value || ''
    }
  }, [value])

  const exec = (cmd) => {
    ref.current?.focus()
    document.execCommand(cmd, false, null)
    onChange(ref.current.innerHTML)
  }

  const minHeight = `${rows * 1.6}em`

  return (
    <div className="border border-fp-border rounded-lg overflow-hidden focus-within:border-fp-brand transition-colors">
      {/* Toolbar */}
      <div className="flex items-center gap-0.5 px-2 py-1.5 bg-fp-inset border-b border-fp-border">
        {TOOLBAR.map(({ cmd, label, title, style }) => (
          <button
            key={cmd}
            type="button"
            title={title}
            onMouseDown={e => { e.preventDefault(); exec(cmd) }}
            className={`px-2 py-0.5 rounded text-fp-muted hover:text-fp-text hover:bg-fp-hover text-xs transition-colors ${style}`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Editable area */}
      <div
        ref={ref}
        contentEditable
        suppressContentEditableWarning
        onInput={() => onChange(ref.current.innerHTML)}
        data-placeholder={placeholder}
        style={{ minHeight }}
        className="w-full bg-fp-bg text-fp-text px-3 py-2 text-sm focus:outline-none leading-relaxed rich-editor"
      />
    </div>
  )
}
