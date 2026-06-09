export default function ShareModal({ orgProfiles, profile, collaborators, onShare, onClose }) {
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 px-4">
      <div className="bg-[#1a2d45] rounded-2xl p-6 w-full max-w-md">
        <h3 className="text-white font-bold text-lg mb-1">Share Proposal</h3>
        <p className="text-[#8A9AB0] text-sm mb-5">Tag teammates on this deal — they'll be notified and gain visibility.</p>
        {orgProfiles.filter(p => p.id !== profile?.id).length === 0 ? (
          <p className="text-[#8A9AB0] text-sm">No other team members found.</p>
        ) : (
          <div className="space-y-2">
            {orgProfiles.filter(p => p.id !== profile?.id).map(p => {
              const isCollab = collaborators.includes(p.id)
              return (
                <div key={p.id} className={`flex justify-between items-center p-3 rounded-lg border cursor-pointer transition-colors ${isCollab ? 'border-[#C8622A] bg-[#C8622A]/10' : 'border-[#2a3d55] bg-[#0F1C2E] hover:border-[#3a4d65]'}`} onClick={() => onShare(p.id)}>
                  <div><p className="text-white text-sm font-medium">{p.full_name}</p><p className="text-[#8A9AB0] text-xs">{p.email}</p></div>
                  <span className={`text-xs font-semibold px-2 py-1 rounded ${isCollab ? 'bg-[#C8622A] text-white' : 'bg-[#2a3d55] text-[#8A9AB0]'}`}>{isCollab ? '✓ Shared' : '+ Share'}</span>
                </div>
              )
            })}
          </div>
        )}
        <button onClick={onClose} className="mt-5 w-full py-2 text-[#8A9AB0] hover:text-white text-sm transition-colors">Done</button>
      </div>
    </div>
  )
}
