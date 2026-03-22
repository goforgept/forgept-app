<div className="px-6 py-5 border-b border-[#2a3d55]">
  <div className="flex justify-between items-center">
    <div>
      <h1 className="text-white text-xl font-bold">
        ForgePt<span className="text-[#C8622A]">.</span>
      </h1>
      {isAdmin && (
        <span className="bg-[#C8622A]/20 text-[#C8622A] text-xs px-2 py-0.5 rounded-full font-semibold mt-1 inline-block">
          Admin
        </span>
      )}
    </div>
    <NotificationBell userId={userId} />
  </div>
</div>
