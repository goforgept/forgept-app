export default function PhotosModal({ photos, uploadingPhoto, onUpload, onUpdateCaption, onDelete, onClose }) {
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 px-4">
      <div className="bg-fp-card rounded-2xl p-6 w-full max-w-2xl max-h-[85vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-5">
          <div><h3 className="text-fp-text font-bold text-lg">📷 Site Photos</h3><p className="text-fp-muted text-sm mt-0.5">Attach job site photos to this proposal</p></div>
          <label className="bg-fp-brand text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-[#b5571f] transition-colors cursor-pointer">
            {uploadingPhoto ? 'Uploading...' : '+ Upload Photo'}
            <input type="file" accept="image/jpeg,image/png,image/webp" onChange={onUpload} className="hidden" disabled={uploadingPhoto} />
          </label>
        </div>
        {photos.length === 0 ? (
          <div className="text-center py-12 border-2 border-dashed border-fp-border rounded-xl"><p className="text-fp-muted text-lg mb-2">📷</p><p className="text-fp-muted text-sm">No photos yet.</p></div>
        ) : (
          <div className="grid grid-cols-2 gap-4">
            {photos.map(photo => (
              <div key={photo.id} className="bg-fp-inset rounded-xl overflow-hidden">
                <img src={photo.displayUrl || photo.url} alt={photo.caption || 'Site photo'} className="w-full h-48 object-cover" />
                <div className="p-3 flex items-center gap-2">
                  <input type="text" value={photo.caption || ''} placeholder="Add caption..." onChange={e => onUpdateCaption(photo.id, e.target.value)} onBlur={e => onUpdateCaption(photo.id, e.target.value)}
                    className="flex-1 bg-fp-card text-fp-text border border-fp-border rounded px-2 py-1 text-xs focus:outline-none focus:border-fp-brand" />
                  <button onClick={() => onDelete(photo.id, photo.url)} className="text-red-400 hover:text-red-300 text-xs">✕</button>
                </div>
              </div>
            ))}
          </div>
        )}
        <button onClick={onClose} className="mt-5 w-full py-2 text-fp-muted hover:text-fp-text text-sm transition-colors">Done</button>
      </div>
    </div>
  )
}
