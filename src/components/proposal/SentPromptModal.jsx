export default function SentPromptModal({ onConfirm, onClose }) {
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 px-4">
      <div className="bg-[#1a2d45] rounded-2xl p-6 w-full max-w-sm text-center">
        <div className="w-12 h-12 rounded-full bg-[#C8622A]/20 flex items-center justify-center mx-auto mb-4"><span className="text-[#C8622A] text-xl">✉</span></div>
        <h3 className="text-white font-bold text-lg mb-2">Did you send this proposal?</h3>
        <p className="text-[#8A9AB0] text-sm mb-6">Mark it as Sent so follow-up emails go out automatically on schedule.</p>
        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 py-2 bg-[#0F1C2E] text-[#8A9AB0] hover:text-white rounded-lg text-sm transition-colors">Not yet</button>
          <button onClick={onConfirm} className="flex-1 py-2 bg-[#C8622A] text-white rounded-lg text-sm font-semibold hover:bg-[#b5571f] transition-colors">Yes, mark as Sent</button>
        </div>
      </div>
    </div>
  )
}
