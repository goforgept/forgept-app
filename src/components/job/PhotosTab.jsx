const PHOTO_CATEGORIES = ['Before', 'During', 'After', 'Issue/Defect', 'Equipment', 'Panel/Rack', 'Cable Run', 'Other']

export default function PhotosTab({ photos, photoCategory, setPhotoCategory, uploadingPhoto, onUpload, onDownloadAll, onUpdateCaption, onDelete }) {
  return (
    <div className="bg-[#1a2d45] rounded-xl p-6">
      <div className="flex justify-between items-center mb-5">
        <div>
          <h3 className="text-white font-bold text-lg">Site Photos</h3>
          <p className="text-[#8A9AB0] text-sm mt-0.5">{photos.length} photo{photos.length !== 1 ? 's' : ''}</p>
        </div>
        <div className="flex items-center gap-3">
          <select value={photoCategory} onChange={e => setPhotoCategory(e.target.value)}
            className="bg-[#0F1C2E] text-white border border-[#2a3d55] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#C8622A]">
            {PHOTO_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          {photos.length > 0 && (
            <button onClick={onDownloadAll}
              className="bg-[#2a3d55] text-white px-4 py-2 rounded-lg text-sm hover:bg-[#3a4d65] transition-colors">
              ↓ Download All
            </button>
          )}
          <label className="bg-[#C8622A] text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-[#b5571f] transition-colors cursor-pointer">
            {uploadingPhoto ? 'Uploading...' : '+ Upload Photo'}
            <input type="file" accept="image/jpeg,image/png,image/webp" onChange={onUpload} className="hidden" disabled={uploadingPhoto} />
          </label>
        </div>
      </div>

      {photos.length === 0 ? (
        <div className="text-center py-12 border-2 border-dashed border-[#2a3d55] rounded-xl">
          <p className="text-4xl mb-3">📷</p>
          <p className="text-[#8A9AB0]">No photos yet.</p>
          <p className="text-[#8A9AB0] text-sm mt-1">Upload before, during, and after photos to document this job.</p>
        </div>
      ) : (
        <div>
          {PHOTO_CATEGORIES.map(category => {
            const categoryPhotos = photos.filter(p => p.category === category)
            if (categoryPhotos.length === 0) return null
            return (
              <div key={category} className="mb-6">
                <p className="text-[#8A9AB0] text-xs font-semibold uppercase tracking-wide mb-3">{category} ({categoryPhotos.length})</p>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  {categoryPhotos.map(photo => (
                    <div key={photo.id} className="bg-[#0F1C2E] rounded-xl overflow-hidden border border-[#2a3d55]">
                      <img src={photo.url} alt={photo.caption || category}
                        className="w-full h-48 object-cover cursor-pointer"
                        onClick={() => window.open(photo.url, '_blank')} />
                      <div className="p-3 space-y-2">
                        <input type="text" value={photo.caption || ''} placeholder="Add caption..."
                          onChange={e => onUpdateCaption(photo.id, e.target.value)}
                          onBlur={e => onUpdateCaption(photo.id, e.target.value)}
                          className="w-full bg-[#1a2d45] text-white border border-[#2a3d55] rounded px-2 py-1 text-xs focus:outline-none focus:border-[#C8622A]" />
                        <div className="flex justify-between items-center">
                          <span className="text-[#8A9AB0] text-xs">{new Date(photo.created_at).toLocaleDateString()}</span>
                          <button onClick={() => onDelete(photo.id, photo.storage_path)}
                            className="text-[#2a3d55] hover:text-red-400 text-xs transition-colors">Delete</button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
