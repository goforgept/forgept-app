export default function ShareModal({ orgProfiles, profile, collaborators, onShare, onClose }) {
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 px-4">
      <div className="bg-fp-card rounded-2xl p-6 w-full max-w-md">
        <h3 className="text-fp-text font-bold text-lg mb-1">Share Proposal</h3>
        <p className="text-fp-muted text-sm mb-5">Tag teammates on this deal — they'll be notified and gain visibility.</p>
        {orgProfiles.filter(p => p.id !== profile?.id).length === 0 ? (
          <p className="text-fp-muted text-sm">No other team members found.</p>
        ) : (
          <div className="space-y-2">
            {orgProfiles.filter(p => p.id !== profile?.id).map(p => {
              const isCollab = collaborators.includes(p.id)
              return (
                <div key={p.id} className={`flex justify-between items-center p-3 rounded-lg border cursor-pointer transition-colors ${isCollab ? 'border-[#C8622A] bg-[#C8622A]/10' : 'border-fp-border bg-fp-inset hover:border-[#3a4d65]'}`} onClick={() => onShare(p.id)}>
                  <div><p className="text-fp-text text-sm font-medium">{p.full_name}</p><p className="text-fp-muted text-xs">{p.email}</p></div>
                  <span className={`text-xs font-semibold px-2 py-1 rounded ${isCollab ? 'bg-fp-brand text-white' : 'bg-fp-inset text-fp-muted'}`}>{isCollab ? '✓ Shared' : '+ Share'}</span>
                </div>
              )
            })}
          </div>
        )}
        <button onClick={onClose} className="mt-5 w-full py-2 text-fp-muted hover:text-fp-text text-sm transition-colors">Done</button>
      </div>
    </div>
  )
}
