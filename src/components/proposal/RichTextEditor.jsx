import { useRef, useEffect } from 'react'

// Renders HTML (or legacy plain text) directly into a jsPDF document.
// Preserves bold, italic, bullet lists, numbered lists, and paragraph spacing.
// Returns the final Y position after rendering.
export const renderHtmlToPdf = (doc, html, { x = 14, startY, maxWidth, fontSize, lineH, pageH, font = 'helvetica' }) => {
  if (!html) return startY
  doc.setFontSize(fontSize)

  const style = (b, it) => b ? (it ? 'bolditalic' : 'bold') : (it ? 'italic' : 'normal')

  // Legacy plain text — no HTML tags
  if (!/<[a-z][\s\S]*>/i.test(html)) {
    doc.setFont(font, 'normal')
    const lines = doc.splitTextToSize(html, maxWidth)
    let y = startY
    for (const line of lines) {
      if (y + lineH > pageH - 20) { doc.addPage(); y = 20 }
      doc.text(line, x, y); y += lineH
    }
    return y
  }

  const tmp = document.createElement('div')
  tmp.innerHTML = html

  // Recursively extract [{text, b, it, ul}] runs from an element.
  // Checks the element itself AND its inline styles so spans like
  // <span style="font-weight:bold"> produced by execCommand or Word paste are caught.
  const getRuns = (el, b = false, it = false, ul = false) => {
    if (!el?.childNodes) return []
    const tag = el.tagName?.toLowerCase?.() || ''
    const fw = el.style?.fontWeight || ''
    const thisB = b || tag === 'b' || tag === 'strong' || fw === 'bold' || parseInt(fw) >= 600
    const thisI = it || tag === 'i' || tag === 'em' || el.style?.fontStyle === 'italic'
    const thisU = ul || tag === 'u' || (el.style?.textDecoration || '').includes('underline')

    const runs = []
    for (const node of el.childNodes) {
      if (node.nodeType === 3) {
        if (node.textContent) runs.push({ text: node.textContent, b: thisB, it: thisI, ul: thisU })
      } else if (node.nodeType === 1) {
        runs.push(...getRuns(node, thisB, thisI, thisU))
      }
    }
    return runs
  }

  // Word-wrap a run array into lines of [{text, b, it, ul, w}]
  const wrapRuns = (runs, availW) => {
    const words = []
    for (const run of runs) {
      for (const part of run.text.split(/(\s+)/)) {
        if (part) words.push({ text: part, b: run.b, it: run.it, ul: run.ul })
      }
    }
    if (!words.length) return []
    const lines = []; let cur = [], curW = 0
    for (const word of words) {
      doc.setFont(font, style(word.b, word.it))
      const w = doc.getTextWidth(word.text)
      if (curW + w > availW && cur.length && word.text.trim()) {
        lines.push(cur); cur = [{ ...word, w }]; curW = w
      } else {
        cur.push({ ...word, w }); curW += w
      }
    }
    if (cur.length) lines.push(cur)
    return lines
  }

  // Draw pre-built lines starting at (lx, ly), returns y after last line
  const drawLines = (lines, lx, ly) => {
    const prevLineWidth = doc.getLineWidth()
    for (const line of lines) {
      if (ly + lineH > pageH - 20) { doc.addPage(); ly = 20 }
      let cx = lx
      for (const word of line) {
        doc.setFont(font, style(word.b, word.it))
        doc.text(word.text, cx, ly)
        if (word.ul && word.text.trim()) {
          doc.setLineWidth(0.3)
          doc.line(cx, ly + 0.6, cx + word.w, ly + 0.6)
        }
        cx += word.w
      }
      ly += lineH
    }
    doc.setLineWidth(prevLineWidth)
    return ly
  }

  let y = startY

  for (const node of tmp.childNodes) {
    if (node.nodeType === 3) {
      const text = node.textContent.trim()
      if (text) y = drawLines(wrapRuns([{ text, b: false, it: false }], maxWidth), x, y)
    } else if (node.nodeType === 1) {
      const tag = node.tagName.toLowerCase()

      if (tag === 'ul' || tag === 'ol') {
        let idx = 1
        for (const li of node.children) {
          if (li.tagName.toLowerCase() !== 'li') continue
          const prefix = tag === 'ul' ? '• ' : `${idx++}. `
          doc.setFont(font, 'normal')
          const prefW = doc.getTextWidth(prefix)
          const textX = x + 4 + prefW
          const lines = wrapRuns(getRuns(li), maxWidth - 4 - prefW)
          if (y + lineH > pageH - 20) { doc.addPage(); y = 20 }
          doc.setFont(font, 'normal')
          doc.text(prefix, x + 4, y)
          y = lines.length ? drawLines(lines, textX, y) : y + lineH
        }
        y += lineH * 0.3

      } else if (tag === 'p' || tag === 'div') {
        const runs = getRuns(node)
        if (runs.some(r => r.text.trim())) {
          y = drawLines(wrapRuns(runs, maxWidth), x, y)
          y += lineH * 0.3 // paragraph gap
        }

      } else if (tag === 'br') {
        y += lineH

      } else {
        const runs = getRuns(node)
        if (runs.some(r => r.text.trim()))
          y = drawLines(wrapRuns(runs, maxWidth), x, y)
      }
    }
  }

  doc.setFont(font, 'normal')
  return y
}

// Converts stored HTML to plain text for DOCX rendering.
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

    // Capture semantic styles BEFORE stripping attributes
    const fw = node.style?.fontWeight || ''
    const isBold = fw === 'bold' || parseInt(fw) >= 600
    const isItalic = (node.style?.fontStyle || '') === 'italic'
    const isUnderline = (node.style?.textDecoration || '').includes('underline')

    // Strip all attributes (removes Word inline styles, class, id, etc.)
    while (node.attributes.length > 0) node.removeAttribute(node.attributes[0].name)

    if (KEEP.has(tag)) return // keep as-is, stripped of attributes

    if (TO_P.has(tag)) {
      const p = document.createElement('p')
      while (node.firstChild) p.appendChild(node.firstChild)
      node.replaceWith(p)
      return
    }

    // For non-semantic tags (span, font, etc.) — preserve bold/italic/underline as semantic tags
    let container = document.createDocumentFragment()
    let inner = container
    if (isBold) { const b = document.createElement('b'); inner.appendChild(b); inner = b }
    if (isItalic) { const i = document.createElement('i'); inner.appendChild(i); inner = i }
    if (isUnderline) { const u = document.createElement('u'); inner.appendChild(u); inner = u }
    while (node.firstChild) inner.appendChild(node.firstChild)
    node.replaceWith(container)
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
