export default function DesignerTab() {
  return (
    <div className="space-y-8">
      {/* Title Block */}
      <div className="bg-[#1a2d45] border border-[#2a3d55] rounded-xl p-6">
        <h3 className="text-white font-bold text-base mb-4">Title Block</h3>
        <p className="text-[#8A9AB0] text-xs mb-4">Used on all shop drawing and as-built exports.</p>
        <div className="grid grid-cols-2 gap-4">
          {[
            ['Designer / Engineer Name', 'title_block_engineer'],
            ['License Number', 'title_block_license'],
            ['Default Scale', 'title_block_scale'],
          ].map(([label, field]) => (
            <div key={field}>
              <label className="text-[#8A9AB0] text-xs mb-1 block">{label}</label>
              <input type="text" placeholder={label}
                className="w-full bg-[#0F1C2E] text-white border border-[#2a3d55] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#C8622A]" />
            </div>
          ))}
          <div>
            <label className="text-[#8A9AB0] text-xs mb-1 block">Default Sheet Size</label>
            <select className="w-full bg-[#0F1C2E] text-white border border-[#2a3d55] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#C8622A]">
              <option value="letter">Letter (8.5 × 11)</option>
              <option value="tabloid">Tabloid (11 × 17)</option>
              <option value="arch_d">Arch D (24 × 36)</option>
            </select>
          </div>
        </div>
      </div>

      {/* Symbol Library */}
      <div className="bg-[#1a2d45] border border-[#2a3d55] rounded-xl p-6">
        <h3 className="text-white font-bold text-base mb-1">Symbol Library</h3>
        <p className="text-[#8A9AB0] text-xs mb-4">Global symbols are managed by ForgePt and available to all orgs. Add your own custom symbols for devices not in the global library.</p>
        <div className="flex items-center justify-between mb-3">
          <span className="text-white text-sm font-semibold">My Custom Symbols</span>
          <button className="px-3 py-1.5 bg-[#C8622A] text-white text-xs font-semibold rounded-lg hover:bg-[#b5571f] transition-colors">
            + Add Custom Symbol
          </button>
        </div>
        <div className="bg-[#0F1C2E] rounded-lg border border-[#2a3d55] p-8 text-center">
          <p className="text-[#8A9AB0] text-sm">No custom symbols yet</p>
          <p className="text-[#8A9AB0] text-xs mt-1">Add devices not in the global library — your part numbers, descriptions, and category icons</p>
        </div>
      </div>

      {/* Assembly Templates */}
      <div className="bg-[#1a2d45] border border-[#2a3d55] rounded-xl p-6">
        <h3 className="text-white font-bold text-base mb-1">Assembly Templates</h3>
        <p className="text-[#8A9AB0] text-xs mb-4">Save device configurations as templates to apply quickly during design.</p>
        <div className="bg-[#0F1C2E] rounded-lg border border-[#2a3d55] p-8 text-center">
          <p className="text-[#8A9AB0] text-sm">No templates yet</p>
          <p className="text-[#8A9AB0] text-xs mt-1">Templates are created from the Designer when you save a device configuration</p>
        </div>
      </div>

      {/* Storage Preferences */}
      <div className="bg-[#1a2d45] border border-[#2a3d55] rounded-xl p-6">
        <h3 className="text-white font-bold text-base mb-1">Storage & Cleanup</h3>
        <p className="text-[#8A9AB0] text-xs mb-4">Control when inactive projects are flagged for cleanup. You will always be prompted before anything is deleted.</p>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-[#8A9AB0] text-xs mb-1 block">Flag inactive drafts after</label>
            <select className="w-full bg-[#0F1C2E] text-white border border-[#2a3d55] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#C8622A]">
              <option value="30">30 days</option>
              <option value="60">60 days</option>
              <option value="90">90 days</option>
              <option value="180">180 days</option>
              <option value="never">Never</option>
            </select>
          </div>
          <div>
            <label className="text-[#8A9AB0] text-xs mb-1 block">Flag lost opportunities after</label>
            <select className="w-full bg-[#0F1C2E] text-white border border-[#2a3d55] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#C8622A]">
              <option value="30">30 days</option>
              <option value="60">60 days</option>
              <option value="90">90 days</option>
              <option value="never">Never</option>
            </select>
          </div>
        </div>
      </div>
    </div>
  )
}
