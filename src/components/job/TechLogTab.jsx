export default function TechLogTab({ techLogs }) {
  const totalHours = techLogs.reduce((sum, l) => sum + (l.hours_worked || 0), 0)

  return (
    <div className="bg-[#1a2d45] rounded-xl p-6">
      <div className="flex justify-between items-center mb-5">
        <div>
          <h3 className="text-white font-bold text-lg">Tech Daily Log</h3>
          <p className="text-[#8A9AB0] text-xs mt-0.5">
            {totalHours.toFixed(1)} total hours · {techLogs.length} entries
          </p>
        </div>
        <button onClick={() => window.location.href = '/tech-log'}
          className="bg-[#2a3d55] text-white px-4 py-2 rounded-lg text-sm hover:bg-[#3a4d65] transition-colors">
          Open Full Log →
        </button>
      </div>
      {techLogs.length === 0 ? (
        <div className="text-center py-8 border-2 border-dashed border-[#2a3d55] rounded-xl">
          <p className="text-[#8A9AB0]">No log entries yet for this job.</p>
          <button onClick={() => window.location.href = '/tech-log'} className="mt-3 text-[#C8622A] hover:text-white text-sm transition-colors">+ Log Today's Work →</button>
        </div>
      ) : (
        <div className="space-y-3">
          {techLogs.map(log => (
            <div key={log.id} className="bg-[#0F1C2E] rounded-xl p-4 border border-[#2a3d55]">
              <div className="flex justify-between items-start mb-2">
                <div className="flex items-center gap-3">
                  <span className="text-[#8A9AB0] text-xs font-mono bg-[#1a2d45] px-2 py-0.5 rounded">
                    {new Date(log.log_date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                  </span>
                  <span className="text-white text-sm font-medium">{log.profiles?.full_name}</span>
                </div>
                <span className="text-[#C8622A] font-bold">{log.hours_worked || 0} hrs</span>
              </div>
              <p className="text-[#D6E4F0] text-sm">{log.work_summary}</p>
              {log.materials_used && (() => {
                let parsed = null
                try { parsed = JSON.parse(log.materials_used) } catch {}
                if (Array.isArray(parsed) && parsed.length > 0) {
                  return (
                    <div className="mt-2">
                      <p className="text-[#8A9AB0] text-xs font-semibold mb-1">📦 Materials Used</p>
                      <div className="space-y-0.5">
                        {parsed.map((m, i) => (
                          <p key={i} className="text-[#8A9AB0] text-xs">· {m.name} — {m.qty} {m.unit}{m.planned && m.qty !== m.planned ? <span className="text-yellow-500/70"> (planned: {m.planned})</span> : null}</p>
                        ))}
                      </div>
                    </div>
                  )
                }
                return <p className="text-[#8A9AB0] text-xs mt-1">📦 {log.materials_used}</p>
              })()}
              {log.issues && <p className="text-red-400 text-xs mt-1">⚠ {log.issues}</p>}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
