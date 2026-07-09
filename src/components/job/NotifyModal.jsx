export default function NotifyModal({ job, notifyMessage, setNotifyMessage, sendingNotify, onSend, onClose }) {
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 px-4">
      <div className="bg-fp-card rounded-2xl p-6 w-full max-w-lg">
        <h3 className="text-fp-text font-bold text-lg mb-1">Notify Customer</h3>
        <p className="text-fp-muted text-sm mb-4">Sending to <span className="text-fp-text">{job?.clients?.email}</span></p>
        <textarea value={notifyMessage} onChange={e => setNotifyMessage(e.target.value)} rows={8}
          className="w-full bg-fp-inset text-fp-text border border-fp-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-fp-brand resize-none mb-4" />
        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 py-2 text-fp-muted hover:text-fp-text text-sm transition-colors">Skip</button>
          <button onClick={onSend} disabled={sendingNotify || !notifyMessage.trim()}
            className="flex-1 bg-fp-brand text-white py-2 rounded-lg text-sm font-semibold hover:bg-[#b5571f] transition-colors disabled:opacity-50">
            {sendingNotify ? 'Sending...' : 'Send Notification →'}
          </button>
        </div>
      </div>
    </div>
  )
}
