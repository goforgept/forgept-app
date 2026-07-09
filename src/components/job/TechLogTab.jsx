export default function TechLogTab({ techLogs }) {
  const totalHours = techLogs.reduce((sum, l) => sum + (l.hours_worked || 0), 0)

  return (
    <div className="bg-fp-card rounded-xl p-6">
      <div className="flex justify-between items-center mb-5">
        <div>
          <h3 className="text-fp-text font-bold text-lg">Tech Daily Log</h3>
          <p className="text-fp-muted text-xs mt-0.5">
            {totalHours.toFixed(1)} total hours · {techLogs.length} entries
          </p>
        </div>
        <button onClick={() => window.location.href = '/tech-log'}
          className="bg-fp-inset text-fp-text px-4 py-2 rounded-lg text-sm hover:bg-fp-hover transition-colors">
          Open Full Log →
        </button>
      </div>
      {techLogs.length === 0 ? (
        <div className="text-center py-8 border-2 border-dashed border-fp-border rounded-xl">
          <p className="text-fp-muted">No log entries yet for this job.</p>
          <button onClick={() => window.location.href = '/tech-log'} className="mt-3 text-[#C8622A] hover:text-fp-text text-sm transition-colors">+ Log Today's Work →</button>
        </div>
      ) : (
        <div className="space-y-3">
          {techLogs.map(log => (
            <div key={log.id} className="bg-fp-inset rounded-xl p-4 border border-fp-border">
              <div className="flex justify-between items-start mb-2">
                <div className="flex items-center gap-3">
                  <span className="text-fp-muted text-xs font-mono bg-fp-card px-2 py-0.5 rounded">
                    {new Date(log.log_date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                  </span>
                  <span className="text-fp-text text-sm font-medium">{log.profiles?.full_name}</span>
                </div>
                <span className="text-[#C8622A] font-bold">{log.hours_worked || 0} hrs</span>
              </div>
              <p className="text-fp-text text-sm">{log.work_summary}</p>
              {log.materials_used && (() => {
                let parsed = null
                try { parsed = JSON.parse(log.materials_used) } catch {}
                if (Array.isArray(parsed) && parsed.length > 0) {
                  return (
                    <div className="mt-2">
                      <p className="text-fp-muted text-xs font-semibold mb-1">📦 Materials Used</p>
                      <div className="space-y-0.5">
                        {parsed.map((m, i) => (
                          <p key={i} className="text-fp-muted text-xs">· {m.name} — {m.qty} {m.unit}{m.planned && m.qty !== m.planned ? <span className="text-yellow-500/70"> (planned: {m.planned})</span> : null}</p>
                        ))}
                      </div>
                    </div>
                  )
                }
                return <p className="text-fp-muted text-xs mt-1">📦 {log.materials_used}</p>
              })()}
              {log.issues && <p className="text-red-400 text-xs mt-1">⚠ {log.issues}</p>}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
