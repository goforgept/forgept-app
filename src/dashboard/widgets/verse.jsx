import { useState } from 'react'
import { Card } from '../ui'

import { VERSES } from './verses'

// Day of the year (0–365): every calendar date has its own verse, the same for everyone.
const dayOfYear = () => { const d = new Date(); return Math.round((new Date(d.getFullYear(), d.getMonth(), d.getDate()) - new Date(d.getFullYear(), 0, 1)) / 864e5) }

export function VerseOfTheDay() {
  const [copied, setCopied] = useState(false)
  const [ref, text] = VERSES[dayOfYear() % VERSES.length]
  const copy = async () => {
    try { await navigator.clipboard.writeText(`"${text}" ${ref} (KJV)`); setCopied(true); setTimeout(() => setCopied(false), 1500) } catch { /* clipboard blocked */ }
  }
  return (
    <Card title="Verse of the day">
      <blockquote className="flex-1 flex flex-col justify-center gap-3">
        <p className="text-fp-text text-[17px] leading-relaxed" style={{ fontFamily: 'Georgia, "Times New Roman", serif' }}>“{text}”</p>
        <footer className="flex items-center justify-between gap-3 flex-wrap">
          <cite className="not-italic text-fp-brand text-sm font-semibold">{ref} <span className="text-fp-muted font-normal">· KJV</span></cite>
          <span className="flex gap-3 text-xs">
            <button onClick={copy} className="text-fp-muted hover:text-fp-text">{copied ? 'Copied' : 'Copy'}</button>
            <a href={`https://www.biblegateway.com/passage/?search=${encodeURIComponent(ref.replace('–', '-'))}&version=KJV`} target="_blank" rel="noopener noreferrer" className="text-fp-muted hover:text-fp-text">Read in context ↗</a>
          </span>
        </footer>
      </blockquote>
    </Card>
  )
}
