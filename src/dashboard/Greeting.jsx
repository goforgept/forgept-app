import { useDash } from './context'
import { todayYMD, daysSince, daysUntil, C } from './util'

// One line a day, the same all day for everyone (picked by date, not random).
const LINES = [
  "Let's get some jobs closed today.",
  'Have a groovy day.',
  'Fresh day, fresh pipeline.',
  'Small follow-ups win big jobs.',
  'One more call than yesterday.',
  "Here's where things stand.",
  'Make it a good one.',
  'Coffee first, then quotes.',
  'Measure twice, quote once.',
  'Every site walk is a future job.',
  "You've got this.",
  'Keep the momentum going.',
  'A good day to send that proposal.',
  'The best follow-up is the one you send.',
  'Clean pipeline, clear head.',
  'Win the morning, win the day.',
  'Let\'s make today count.',
  'Steady wins the bid.',
  'Nice to see you.',
  'Onward.',
]
const MONDAY = ['New week, new wins.', 'Fresh week. Let\'s set the pace.']
const FRIDAY = ['Strong finish to the week.', 'Close it out and enjoy the weekend.']

function lineFor(d) {
  const dayIndex = Math.floor(new Date(d.getFullYear(), d.getMonth(), d.getDate()) / 864e5)
  if (d.getDay() === 1) return MONDAY[dayIndex % MONDAY.length]
  if (d.getDay() === 5) return FRIDAY[dayIndex % FRIDAY.length]
  return LINES[dayIndex % LINES.length]
}

export function Greeting({ name, actions }) {
  const now = new Date()
  const h = now.getHours()
  const hello = h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'
  return (
    <header className="flex flex-wrap gap-4 items-end justify-between">
      <div className="flex flex-col gap-1 min-w-0">
        <p className="text-fp-muted text-[13px]">{now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</p>
        <h1 className="text-fp-text text-[28px] leading-tight font-bold tracking-tight">{hello}{name ? `, ${name}` : ''}</h1>
        <p className="text-fp-muted text-[15px]">{lineFor(now)}</p>
      </div>
      <div className="flex flex-wrap gap-2">{actions}</div>
    </header>
  )
}

/** "Today" summary: a few counts worth acting on, each one a link. Hidden while loading. */
export function TodayStrip() {
  const { data, loading, isTeam, go } = useDash()
  if (loading) return <div className="h-9" />
  const today = todayYMD()
  const tasks = data.tasks || []
  const proposals = data.proposals || []
  const meetings = tasks.filter(t => t.due_date === today && t.meeting_type).length
  const due = tasks.filter(t => t.due_date === today && !t.meeting_type).length
  const overdueTasks = tasks.filter(t => t.due_date < today).length
  const expiring = proposals.filter(p => p.status === 'Sent' && p.quote_expires_at && daysUntil(p.quote_expires_at) >= 0 && daysUntil(p.quote_expires_at) <= 7).length
  const drafts = proposals.filter(p => p.status === 'Draft' && daysSince(p.created_at) >= 3).length
  const overdueInv = (data.invoices || []).filter(i => (i.status === 'Sent' || i.status === 'Partial') && i.due_date && new Date(i.due_date) < new Date()).length
  const lateJobs = (data.jobs || []).filter(j => !['Completed', 'Cancelled', 'On Hold'].includes(j.status) && j.end_date && new Date(j.end_date + 'T23:59:59') < new Date()).length

  const chips = [
    { n: meetings, one: 'meeting today', many: 'meetings today', dot: C.blue, to: '/tasks' },
    { n: due, one: 'task due today', many: 'tasks due today', dot: C.violet, to: '/tasks' },
    { n: overdueTasks, one: 'overdue task', many: 'overdue tasks', dot: C.red, to: '/tasks' },
    { n: expiring, one: 'quote expiring this week', many: 'quotes expiring this week', dot: C.amber, to: '/proposals?status=Sent' },
    { n: drafts, one: 'draft waiting to send', many: 'drafts waiting to send', dot: C.orange, to: '/proposals?status=Draft' },
    { n: isTeam ? overdueInv : 0, one: 'overdue invoice', many: 'overdue invoices', dot: C.red, to: '/invoices' },
    { n: lateJobs, one: 'job past its end date', many: 'jobs past their end date', dot: C.red, to: '/jobs' },
  ].filter(c => c.n > 0)

  return (
    <nav aria-label="Today" className="flex flex-wrap gap-2">
      {chips.length === 0
        ? <span className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-fp-card border border-fp-border text-sm text-fp-muted"><span className="w-2 h-2 rounded-full bg-green-500" />Nothing urgent today</span>
        : chips.map(c => (
          <button key={c.one} onClick={() => go(c.to)}
            className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-fp-card border border-fp-border hover:border-fp-brand/50 text-sm transition-colors">
            <span className="w-2 h-2 rounded-full" style={{ background: c.dot }} />
            <strong className="text-fp-text font-semibold tabular-nums">{c.n}</strong>
            <span className="text-fp-muted">{c.n === 1 ? c.one : c.many}</span>
          </button>
        ))}
    </nav>
  )
}
