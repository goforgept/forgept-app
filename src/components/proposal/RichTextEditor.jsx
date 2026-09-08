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

// Strips Word/Google Docs paste noise down to clean semantic HTML.
// Keeps bold, italic, underline, bullet/numbered lists, paragraph breaks.
const cleanPastedHtml = (html) => {
  const tmp = document.createElement('div')
  tmp.innerHTML = html

  // Tags we keep (semantic meaning survives)
  const KEEP = new Set(['b', 'strong', 'i', 'em', 'u', 'ul', 'ol', 'li', 'br', 'p'])
  // Block-level tags we convert to <p>
  const TO_P = new Set(['div', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'section', 'article'])

  const walk = (node) => {
    // Process children first (bottom-up so replacements are stable)
    Array.from(node.childNodes).forEach(walk)

    if (node.nodeType !== Node.ELEMENT_NODE) return

    const tag = node.tagName.toLowerCase()

    // Strip all attributes from every element (removes Word inline styles, class, id, etc.)
    while (node.attributes.length > 0) node.removeAttribute(node.attributes[0].name)

    if (KEEP.has(tag)) return // keep as-is, stripped of attributes

    if (TO_P.has(tag)) {
      // Replace with <p> so it still creates a line break
      const p = document.createElement('p')
      while (node.firstChild) p.appendChild(node.firstChild)
      node.replaceWith(p)
      return
    }

    // Everything else (span, font, table cruft, etc.) — unwrap: keep children, drop the tag
    const frag = document.createDocumentFragment()
    while (node.firstChild) frag.appendChild(node.firstChild)
    node.replaceWith(frag)
  }

  // Remove script/style/meta entirely
  tmp.querySelectorAll('script,style,meta,link,head').forEach(el => el.remove())

  walk(tmp)
  return tmp.innerHTML
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
  { cmd: 'bold',                label: 'B',   title: 'Bold',          style: 'font-bold' },
  { cmd: 'italic',              label: 'I',   title: 'Italic',        style: 'italic' },
  { cmd: 'underline',           label: 'U',   title: 'Underline',     style: 'underline' },
  { cmd: 'insertUnorderedList', label: '•—',  title: 'Bullet list',   style: '' },
  { cmd: 'insertOrderedList',   label: '1.',  title: 'Numbered list', style: '' },
]

export default function RichTextEditor({ value, onChange, placeholder, rows = 6 }) {
  const ref = useRef(null)

  // Each Enter press creates a <p>, so bullet/list toggles apply per-paragraph not per-editor
  useEffect(() => {
    document.execCommand('defaultParagraphSeparator', false, 'p')
  }, [])

  // Initialise or reset content only when the element is not focused
  useEffect(() => {
    if (ref.current && document.activeElement !== ref.current) {
      ref.current.innerHTML = value || ''
    }
  }, [value])

  const exec = (cmd) => {
    ref.current?.focus()
    // If content is bare text with no block wrapper, wrap it first so the
    // command applies only to the current paragraph, not the whole editor.
    if (ref.current && !ref.current.querySelector('p,ul,ol,li,div')) {
      document.execCommand('formatBlock', false, 'p')
    }
    document.execCommand(cmd, false, null)
    onChange(ref.current.innerHTML)
  }

  const handlePaste = (e) => {
    e.preventDefault()
    const clipHtml = e.clipboardData.getData('text/html')
    if (clipHtml) {
      const clean = cleanPastedHtml(clipHtml)
      document.execCommand('insertHTML', false, clean)
    } else {
      // Plain text fallback — preserve line breaks
      const text = e.clipboardData.getData('text/plain')
      document.execCommand('insertText', false, text)
    }
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
        onPaste={handlePaste}
        data-placeholder={placeholder}
        style={{ minHeight }}
        className="w-full bg-fp-bg text-fp-text px-3 py-2 text-sm focus:outline-none leading-relaxed rich-editor"
      />
    </div>
  )
}
