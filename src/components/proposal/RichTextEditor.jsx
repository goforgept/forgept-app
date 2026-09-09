import { useEffect } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Underline from '@tiptap/extension-underline'
import TextAlign from '@tiptap/extension-text-align'
import Placeholder from '@tiptap/extension-placeholder'

// ── PDF renderer ──────────────────────────────────────────────────────────
// Renders HTML (or legacy plain text) into a jsPDF document.
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

  // Recursively extract [{text, b, it, ul}] runs from an element
  const getRuns = (el, b = false, it = false, ul = false) => {
    if (!el?.childNodes) return []
    const tag = el.tagName?.toLowerCase?.() || ''
    const fw = el.style?.fontWeight || ''
    const isH = tag === 'h1' || tag === 'h2' || tag === 'h3'
    const thisB = b || isH || tag === 'b' || tag === 'strong' || fw === 'bold' || parseInt(fw) >= 600
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

  // Draw pre-built lines with optional alignment; returns y after last line
  const drawLines = (lines, lx, ly, { align = 'left', lh = lineH } = {}) => {
    const prevLW = doc.getLineWidth()
    for (const line of lines) {
      if (ly + lh > pageH - 20) { doc.addPage(); ly = 20 }
      const lineW = line.reduce((sum, w) => sum + w.w, 0)
      let cx = align === 'center' ? lx + (maxWidth - lineW) / 2
             : align === 'right'  ? lx + maxWidth - lineW
             : lx
      for (const word of line) {
        doc.setFont(font, style(word.b, word.it))
        doc.text(word.text, cx, ly)
        if (word.ul && word.text.trim()) {
          doc.setLineWidth(0.3)
          doc.line(cx, ly + 0.6, cx + word.w, ly + 0.6)
        }
        cx += word.w
      }
      ly += lh
    }
    doc.setLineWidth(prevLW)
    return ly
  }

  let y = startY

  for (const node of tmp.childNodes) {
    if (node.nodeType === 3) {
      const text = node.textContent.trim()
      if (text) y = drawLines(wrapRuns([{ text, b: false, it: false }], maxWidth), x, y)
    } else if (node.nodeType === 1) {
      const tag = node.tagName.toLowerCase()

      if (tag === 'h1' || tag === 'h2' || tag === 'h3') {
        const hScale = tag === 'h1' ? 1.6 : tag === 'h2' ? 1.3 : 1.1
        const hSize = Math.round(fontSize * hScale)
        const hLH = lineH * hScale
        doc.setFontSize(hSize)
        const align = node.style?.textAlign || 'left'
        const runs = getRuns(node).map(r => ({ ...r, b: true }))
        if (runs.some(r => r.text.trim())) {
          y = drawLines(wrapRuns(runs, maxWidth), x, y, { align, lh: hLH })
          y += hLH * 0.35
        }
        doc.setFontSize(fontSize)

      } else if (tag === 'ul' || tag === 'ol') {
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
        const align = node.style?.textAlign || 'left'
        const runs = getRuns(node)
        if (runs.some(r => r.text.trim())) {
          y = drawLines(wrapRuns(runs, maxWidth), x, y, { align })
          y += lineH * 0.3
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

// Converts stored HTML to plain text for DOCX rendering
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

const isHtml = (text) => !!text && /<[a-z][\s\S]*>/i.test(text)

// Renders stored content (HTML or legacy plain text) in the UI
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

// ── Toolbar helpers ───────────────────────────────────────────────────────

const Sep = () => <div className="w-px h-4 bg-fp-border mx-0.5 shrink-0" />

const Btn = ({ onClick, active, title, children }) => (
  <button
    type="button"
    title={title}
    onMouseDown={e => { e.preventDefault(); onClick() }}
    className={`px-1.5 py-0.5 rounded text-xs transition-colors shrink-0 leading-none ${
      active ? 'bg-fp-brand text-white' : 'text-fp-muted hover:text-fp-text hover:bg-fp-hover'
    }`}
  >
    {children}
  </button>
)

const AlignLeftIcon = () => (
  <svg width="14" height="11" viewBox="0 0 14 11" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
    <line x1="0" y1="1.5" x2="14" y2="1.5"/>
    <line x1="0" y1="5.5" x2="9" y2="5.5"/>
    <line x1="0" y1="9.5" x2="14" y2="9.5"/>
  </svg>
)
const AlignCenterIcon = () => (
  <svg width="14" height="11" viewBox="0 0 14 11" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
    <line x1="0" y1="1.5" x2="14" y2="1.5"/>
    <line x1="2.5" y1="5.5" x2="11.5" y2="5.5"/>
    <line x1="0" y1="9.5" x2="14" y2="9.5"/>
  </svg>
)
const AlignRightIcon = () => (
  <svg width="14" height="11" viewBox="0 0 14 11" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
    <line x1="0" y1="1.5" x2="14" y2="1.5"/>
    <line x1="5" y1="5.5" x2="14" y2="5.5"/>
    <line x1="0" y1="9.5" x2="14" y2="9.5"/>
  </svg>
)

// ── Main editor component ─────────────────────────────────────────────────

export default function RichTextEditor({ value, onChange, placeholder, rows = 6 }) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
      Underline,
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      Placeholder.configure({ placeholder: placeholder || '' }),
    ],
    content: value || '',
    onUpdate: ({ editor }) => onChange(editor.getHTML()),
  })

  // Sync content when value changes externally (form reset / load)
  useEffect(() => {
    if (!editor) return
    const focused = editor.view?.hasFocus?.() ?? false
    if (!focused && value !== editor.getHTML()) {
      editor.commands.setContent(value || '', false)
    }
  }, [value, editor])

  const minHeight = `${rows * 1.6}em`

  const headingLevel =
    editor?.isActive('heading', { level: 1 }) ? '1' :
    editor?.isActive('heading', { level: 2 }) ? '2' :
    editor?.isActive('heading', { level: 3 }) ? '3' : '0'

  const setHeading = (level) => {
    if (!editor) return
    if (level === 0) editor.chain().focus().setParagraph().run()
    else editor.chain().focus().toggleHeading({ level }).run()
  }

  return (
    <div className="border border-fp-border rounded-lg overflow-hidden focus-within:border-fp-brand transition-colors">
      {editor && (
        <div className="flex flex-wrap items-center gap-0.5 px-2 py-1.5 bg-fp-inset border-b border-fp-border">
          <select
            value={headingLevel}
            onChange={e => setHeading(parseInt(e.target.value))}
            className="bg-fp-hover text-fp-text border border-fp-border rounded px-1.5 py-0.5 text-xs focus:outline-none cursor-pointer"
          >
            <option value="0">Normal</option>
            <option value="1">Heading 1</option>
            <option value="2">Heading 2</option>
            <option value="3">Heading 3</option>
          </select>

          <Sep />

          <Btn onClick={() => editor.chain().focus().toggleBold().run()} active={editor.isActive('bold')} title="Bold">
            <span style={{ fontWeight: 700 }}>B</span>
          </Btn>
          <Btn onClick={() => editor.chain().focus().toggleItalic().run()} active={editor.isActive('italic')} title="Italic">
            <span style={{ fontStyle: 'italic' }}>I</span>
          </Btn>
          <Btn onClick={() => editor.chain().focus().toggleUnderline().run()} active={editor.isActive('underline')} title="Underline">
            <span style={{ textDecoration: 'underline' }}>U</span>
          </Btn>
          <Btn onClick={() => editor.chain().focus().toggleStrike().run()} active={editor.isActive('strike')} title="Strikethrough">
            <span style={{ textDecoration: 'line-through' }}>S</span>
          </Btn>

          <Sep />

          <Btn onClick={() => editor.chain().focus().setTextAlign('left').run()} active={editor.isActive({ textAlign: 'left' })} title="Align left">
            <AlignLeftIcon />
          </Btn>
          <Btn onClick={() => editor.chain().focus().setTextAlign('center').run()} active={editor.isActive({ textAlign: 'center' })} title="Align center">
            <AlignCenterIcon />
          </Btn>
          <Btn onClick={() => editor.chain().focus().setTextAlign('right').run()} active={editor.isActive({ textAlign: 'right' })} title="Align right">
            <AlignRightIcon />
          </Btn>

          <Sep />

          <Btn onClick={() => editor.chain().focus().toggleBulletList().run()} active={editor.isActive('bulletList')} title="Bullet list">•—</Btn>
          <Btn onClick={() => editor.chain().focus().toggleOrderedList().run()} active={editor.isActive('orderedList')} title="Numbered list">1.</Btn>

          <Sep />

          <Btn onClick={() => editor.chain().focus().sinkListItem('listItem').run()} title="Indent">⇥</Btn>
          <Btn onClick={() => editor.chain().focus().liftListItem('listItem').run()} title="Outdent">⇤</Btn>
        </div>
      )}

      <EditorContent
        editor={editor}
        style={{ minHeight }}
        className="tiptap-editor"
      />
    </div>
  )
}
