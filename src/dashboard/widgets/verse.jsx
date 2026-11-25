import { useState } from 'react'
import { Card } from '../ui'

// King James Version (public domain). One verse a day, the same for everyone, picked by date.
const VERSES = [
  ['Psalm 118:24', 'This is the day which the LORD hath made; we will rejoice and be glad in it.'],
  ['Proverbs 3:5–6', 'Trust in the LORD with all thine heart; and lean not unto thine own understanding. In all thy ways acknowledge him, and he shall direct thy paths.'],
  ['Philippians 4:13', 'I can do all things through Christ which strengtheneth me.'],
  ['Jeremiah 29:11', 'For I know the thoughts that I think toward you, saith the LORD, thoughts of peace, and not of evil, to give you an expected end.'],
  ['Joshua 1:9', 'Have not I commanded thee? Be strong and of a good courage; be not afraid, neither be thou dismayed: for the LORD thy God is with thee whithersoever thou goest.'],
  ['Isaiah 40:31', 'But they that wait upon the LORD shall renew their strength; they shall mount up with wings as eagles; they shall run, and not be weary; and they shall walk, and not faint.'],
  ['Colossians 3:23', 'And whatsoever ye do, do it heartily, as to the Lord, and not unto men.'],
  ['Proverbs 16:3', 'Commit thy works unto the LORD, and thy thoughts shall be established.'],
  ['Romans 8:28', 'And we know that all things work together for good to them that love God, to them who are the called according to his purpose.'],
  ['Psalm 46:1', 'God is our refuge and strength, a very present help in trouble.'],
  ['Matthew 6:34', 'Take therefore no thought for the morrow: for the morrow shall take thought for the things of itself. Sufficient unto the day is the evil thereof.'],
  ['Philippians 4:6', 'Be careful for nothing; but in every thing by prayer and supplication with thanksgiving let your requests be made known unto God.'],
  ['Galatians 6:9', 'And let us not be weary in well doing: for in due season we shall reap, if we faint not.'],
  ['Psalm 23:1', 'The LORD is my shepherd; I shall not want.'],
  ['Proverbs 22:29', 'Seest thou a man diligent in his business? he shall stand before kings; he shall not stand before mean men.'],
  ['2 Timothy 1:7', 'For God hath not given us the spirit of fear; but of power, and of love, and of a sound mind.'],
  ['Psalm 37:5', 'Commit thy way unto the LORD; trust also in him; and he shall bring it to pass.'],
  ['Matthew 5:16', 'Let your light so shine before men, that they may see your good works, and glorify your Father which is in heaven.'],
  ['Micah 6:8', 'He hath shewed thee, O man, what is good; and what doth the LORD require of thee, but to do justly, and to love mercy, and to walk humbly with thy God?'],
  ['Proverbs 27:17', 'Iron sharpeneth iron; so a man sharpeneth the countenance of his friend.'],
  ['Lamentations 3:22–23', "It is of the LORD's mercies that we are not consumed, because his compassions fail not. They are new every morning: great is thy faithfulness."],
  ['Psalm 90:17', 'And let the beauty of the LORD our God be upon us: and establish thou the work of our hands upon us; yea, the work of our hands establish thou it.'],
  ['Isaiah 41:10', 'Fear thou not; for I am with thee: be not dismayed; for I am thy God: I will strengthen thee; yea, I will help thee; yea, I will uphold thee with the right hand of my righteousness.'],
  ['John 16:33', 'These things I have spoken unto you, that in me ye might have peace. In the world ye shall have tribulation: but be of good cheer; I have overcome the world.'],
  ['Proverbs 12:24', 'The hand of the diligent shall bear rule: but the slothful shall be under tribute.'],
  ['Romans 12:12', 'Rejoicing in hope; patient in tribulation; continuing instant in prayer.'],
  ['1 Corinthians 16:14', 'Let all your things be done with charity.'],
  ['Psalm 27:1', 'The LORD is my light and my salvation; whom shall I fear? the LORD is the strength of my life; of whom shall I be afraid?'],
  ['Hebrews 11:1', 'Now faith is the substance of things hoped for, the evidence of things not seen.'],
  ['James 1:5', 'If any of you lack wisdom, let him ask of God, that giveth to all men liberally, and upbraideth not; and it shall be given him.'],
  ['Matthew 11:28', 'Come unto me, all ye that labour and are heavy laden, and I will give you rest.'],
  ['Proverbs 15:1', 'A soft answer turneth away wrath: but grievous words stir up anger.'],
  ['Psalm 121:1–2', 'I will lift up mine eyes unto the hills, from whence cometh my help. My help cometh from the LORD, which made heaven and earth.'],
  ['Deuteronomy 31:6', 'Be strong and of a good courage, fear not, nor be afraid of them: for the LORD thy God, he it is that doth go with thee; he will not fail thee, nor forsake thee.'],
  ['1 Peter 5:7', 'Casting all your care upon him; for he careth for you.'],
  ['Psalm 19:14', 'Let the words of my mouth, and the meditation of my heart, be acceptable in thy sight, O LORD, my strength, and my redeemer.'],
  ['Proverbs 11:25', 'The liberal soul shall be made fat: and he that watereth shall be watered also himself.'],
  ['Luke 6:31', 'And as ye would that men should do to you, do ye also to them likewise.'],
  ['Romans 15:13', 'Now the God of hope fill you with all joy and peace in believing, that ye may abound in hope, through the power of the Holy Ghost.'],
  ['Psalm 34:8', 'O taste and see that the LORD is good: blessed is the man that trusteth in him.'],
  ['Proverbs 21:5', 'The thoughts of the diligent tend only to plenteousness; but of every one that is hasty only to want.'],
  ['Ephesians 4:32', "And be ye kind one to another, tenderhearted, forgiving one another, even as God for Christ's sake hath forgiven you."],
  ['John 14:27', 'Peace I leave with you, my peace I give unto you: not as the world giveth, give I unto you. Let not your heart be troubled, neither let it be afraid.'],
  ['Psalm 55:22', 'Cast thy burden upon the LORD, and he shall sustain thee: he shall never suffer the righteous to be moved.'],
  ['Matthew 7:7', 'Ask, and it shall be given you; seek, and ye shall find; knock, and it shall be opened unto you.'],
  ['2 Corinthians 5:7', 'For we walk by faith, not by sight.'],
  ['Proverbs 4:23', 'Keep thy heart with all diligence; for out of it are the issues of life.'],
]

const dayIndex = () => { const d = new Date(); return Math.floor(new Date(d.getFullYear(), d.getMonth(), d.getDate()) / 864e5) }

export function VerseOfTheDay() {
  const [copied, setCopied] = useState(false)
  const [ref, text] = VERSES[dayIndex() % VERSES.length]
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
