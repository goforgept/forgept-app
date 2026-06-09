const inputClass = "bg-[#0F1C2E] text-white border border-[#2a3d55] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#C8622A]"

export default function ScheduleModal({ job, orgProfiles, jobSchedules, schedTechId, setSchedTechId, schedDate, setSchedDate, schedHours, setSchedHours, savingSchedule, onSave, onRemoveSchedule, onClose }) {
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 px-4">
      <div className="bg-[#1a2d45] rounded-2xl p-6 w-full max-w-md">
        <h3 className="text-white font-bold text-lg mb-1">Schedule Tech</h3>
        <p className="text-[#8A9AB0] text-sm mb-5">{job?.name}</p>
        <div className="space-y-4">
          <div>
            <label className="text-[#8A9AB0] text-xs mb-1 block">Technician <span className="text-[#C8622A]">*</span></label>
            <select value={schedTechId} onChange={e => setSchedTechId(e.target.value)} className={`w-full ${inputClass}`}>
              <option value="">— Select tech —</option>
              {orgProfiles.map(p => <option key={p.id} value={p.id}>{p.full_name}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[#8A9AB0] text-xs mb-1 block">Date <span className="text-[#C8622A]">*</span></label>
              <input type="date" value={schedDate} onChange={e => setSchedDate(e.target.value)} className={`w-full ${inputClass}`} />
            </div>
            <div>
              <label className="text-[#8A9AB0] text-xs mb-1 block">Hours on this job</label>
              <select value={schedHours} onChange={e => setSchedHours(e.target.value)} className={`w-full ${inputClass}`}>
                {['1','2','3','4','5','6','7','8'].map(h => <option key={h} value={h}>{h} {parseInt(h) === 1 ? 'hour' : 'hours'}</option>)}
              </select>
            </div>
          </div>
          <p className="text-[#8A9AB0] text-xs">You can add multiple techs or multiple days by saving and adding again.</p>
          {jobSchedules.length > 0 && (
            <div className="bg-[#0F1C2E] rounded-lg p-3">
              <p className="text-[#8A9AB0] text-xs font-semibold mb-2">Already scheduled</p>
              <div className="space-y-1">
                {jobSchedules.map(s => (
                  <div key={s.id} className="flex items-center justify-between text-xs">
                    <span className="text-white">{s.profiles?.full_name} · {new Date(s.date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })} · {s.hours_allocated}h</span>
                    <button onClick={() => onRemoveSchedule(s.id)} className="text-[#8A9AB0] hover:text-red-400 transition-colors ml-2">✕</button>
                  </div>
                ))}
              </div>
            </div>
          )}
          <div className="flex gap-3 pt-2">
            <button onClick={onClose} className="flex-1 py-2 text-[#8A9AB0] hover:text-white text-sm transition-colors">Close</button>
            <button onClick={onSave} disabled={savingSchedule || !schedTechId || !schedDate}
              className="flex-1 bg-blue-600 text-white py-2 rounded-lg text-sm font-semibold hover:bg-blue-700 transition-colors disabled:opacity-50">
              {savingSchedule ? 'Saving...' : 'Add to Schedule'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
