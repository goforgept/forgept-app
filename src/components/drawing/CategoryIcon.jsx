// Shared category icon used in SymbolPicker and RackBuilder
export default function CategoryIcon({ category, size = 40 }) {
  const props = { width: size, height: size, fill: 'none', stroke: 'currentColor', viewBox: '0 0 40 40' }
  switch (category) {
    case 'Dome Camera':
      return <svg {...props}><ellipse cx="20" cy="24" rx="14" ry="6" strokeWidth="1.5"/><path d="M6 24 Q6 10 20 10 Q34 10 34 24" strokeWidth="1.5" fill="none"/><circle cx="20" cy="20" r="4" strokeWidth="1.5"/></svg>
    case 'Bullet Camera':
      return <svg {...props}><rect x="8" y="16" width="20" height="8" rx="2" strokeWidth="1.5"/><path d="M28 18 L34 16 L34 24 L28 22 Z" strokeWidth="1.5" fill="none"/><circle cx="13" cy="20" r="2" strokeWidth="1.5"/></svg>
    case 'PTZ Camera':
      return <svg {...props}><circle cx="20" cy="20" r="10" strokeWidth="1.5"/><circle cx="20" cy="20" r="4" strokeWidth="1.5"/><path d="M20 8 L20 4 M20 36 L20 32 M8 20 L4 20 M36 20 L32 20" strokeWidth="1.5" strokeLinecap="round"/></svg>
    case 'Turret Camera':
      return <svg {...props}><ellipse cx="20" cy="26" rx="12" ry="5" strokeWidth="1.5"/><path d="M8 26 Q8 16 20 14 Q32 16 32 26" strokeWidth="1.5"/><circle cx="20" cy="20" r="5" strokeWidth="1.5"/><circle cx="20" cy="20" r="2" fill="currentColor"/></svg>
    case 'Fisheye Camera': case 'Multi Sensor Camera': case 'Multi-Lens Camera': case 'Indoor Camera':
      return <svg {...props}><circle cx="20" cy="20" r="12" strokeWidth="1.5"/><circle cx="20" cy="20" r="5" strokeWidth="1.5"/><circle cx="20" cy="20" r="2" fill="currentColor"/><path d="M14 10 L10 6 M26 10 L30 6" strokeWidth="1.2" strokeLinecap="round"/></svg>
    case 'LPR Camera':
      return <svg {...props}><rect x="6" y="14" width="24" height="12" rx="2" strokeWidth="1.5"/><path d="M30 17 L36 14 L36 26 L30 23 Z" strokeWidth="1.5" fill="none"/><rect x="10" y="17" width="12" height="6" rx="1" strokeWidth="1"/></svg>
    case 'NVR':
      return <svg {...props}><rect x="6" y="10" width="28" height="20" rx="2" strokeWidth="1.5"/><rect x="10" y="14" width="8" height="6" rx="1" strokeWidth="1.5"/><rect x="22" y="14" width="8" height="6" rx="1" strokeWidth="1.5"/></svg>
    case 'Video Encoder':
      return <svg {...props}><rect x="4" y="12" width="24" height="16" rx="2" strokeWidth="1.5"/><path d="M28 16 L36 12 L36 28 L28 24 Z" strokeWidth="1.5"/><circle cx="10" cy="18" r="1.5" fill="currentColor"/><circle cx="10" cy="22" r="1.5" fill="currentColor"/></svg>
    case 'Cabinet System':
      return <svg {...props}><rect x="8" y="4" width="24" height="32" rx="2" strokeWidth="1.5"/><path d="M8 10 L32 10 M8 30 L32 30" strokeWidth="1.5"/><rect x="12" y="13" width="16" height="8" rx="1" strokeWidth="1"/></svg>
    case 'Cabinet Solar System':
      return <svg {...props}><rect x="8" y="14" width="20" height="22" rx="2" strokeWidth="1.5"/><rect x="4" y="4" width="32" height="8" rx="1" strokeWidth="1.5"/><path d="M10 4 L10 12 M16 4 L16 12 M22 4 L22 12 M28 4 L28 12" strokeWidth="1"/></svg>
    case 'Access Reader':
      return <svg {...props}><rect x="10" y="8" width="20" height="24" rx="3" strokeWidth="1.5"/><rect x="15" y="13" width="10" height="7" rx="1" strokeWidth="1.5"/><circle cx="20" cy="26" r="2" strokeWidth="1.5"/></svg>
    case 'Access Control Door':
      return <svg {...props}><rect x="8" y="4" width="20" height="32" rx="2" strokeWidth="1.5"/><circle cx="25" cy="20" r="2" fill="currentColor"/><path d="M8 4 L8 36" strokeWidth="2" strokeLinecap="round"/></svg>
    case 'Controller':
      return <svg {...props}><rect x="6" y="12" width="28" height="16" rx="2" strokeWidth="1.5"/><circle cx="13" cy="20" r="2" fill="currentColor"/><circle cx="20" cy="20" r="2" fill="currentColor"/><circle cx="27" cy="20" r="2" fill="currentColor"/></svg>
    case 'Intercom': case 'Video Intercom':
      return <svg {...props}><rect x="10" y="6" width="20" height="28" rx="3" strokeWidth="1.5"/><circle cx="20" cy="14" r="4" strokeWidth="1.5"/><path d="M14 24 L26 24 M14 28 L22 28" strokeWidth="1.2" strokeLinecap="round"/></svg>
    case 'Wireless Lock':
      return <svg {...props}><rect x="10" y="18" width="20" height="16" rx="2" strokeWidth="1.5"/><path d="M14 18 L14 13 Q14 6 20 6 Q26 6 26 13 L26 18" strokeWidth="1.5" fill="none"/><circle cx="20" cy="26" r="2.5" fill="currentColor"/></svg>
    case 'Door Operator':
      return <svg {...props}><path d="M6 6 L6 32" strokeWidth="1.5" strokeLinecap="round"/><path d="M6 32 A26 26 0 0 0 32 6" strokeDasharray="3 3" strokeWidth="1"/><rect x="28" y="2" width="10" height="8" rx="1" strokeWidth="1.5"/></svg>
    case 'PIR Detector': case 'Motion Sensor':
      return <svg {...props}><path d="M6 32 Q6 14 20 10 Q34 14 34 32 Z" strokeWidth="1.5" fill="none"/><path d="M12 26 Q12 18 20 16 Q28 18 28 26" strokeWidth="1" strokeDasharray="2 2" fill="none"/><circle cx="20" cy="30" r="2" fill="currentColor"/></svg>
    case 'Door Contact':
      return <svg {...props}><rect x="5" y="8" width="11" height="24" rx="2" strokeWidth="1.5"/><rect x="24" y="8" width="11" height="24" rx="2" strokeWidth="1.5"/><path d="M16 14 L24 14 M16 26 L24 26" strokeWidth="1" strokeDasharray="2 2"/></svg>
    case 'Glass Break':
      return <svg {...props}><circle cx="20" cy="20" r="13" strokeWidth="1.5"/><path d="M20 7 L17 14 L22 14 L16 22 M22 14 L26 19" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5"/></svg>
    case 'Alarm Keypad':
      return <svg {...props}><rect x="10" y="4" width="20" height="32" rx="2" strokeWidth="1.5"/><rect x="13" y="7" width="14" height="8" rx="1" strokeWidth="1.5"/><circle cx="15" cy="20" r="1.5" fill="currentColor"/><circle cx="20" cy="20" r="1.5" fill="currentColor"/><circle cx="25" cy="20" r="1.5" fill="currentColor"/><circle cx="15" cy="25" r="1.5" fill="currentColor"/><circle cx="20" cy="25" r="1.5" fill="currentColor"/><circle cx="25" cy="25" r="1.5" fill="currentColor"/></svg>
    case 'Alarm Panel':
      return <svg {...props}><rect x="4" y="6" width="32" height="28" rx="2" strokeWidth="1.5"/><rect x="8" y="10" width="16" height="10" rx="1" strokeWidth="1.5"/><circle cx="30" cy="13" r="2" fill="currentColor"/><circle cx="30" cy="19" r="2" fill="currentColor"/></svg>
    case 'Interior Siren': case 'Exterior Siren':
      return <svg {...props}><rect x="12" y="12" width="16" height="16" rx="2" strokeWidth="1.5"/><path d="M8 15 Q5 20 8 25" strokeLinecap="round" strokeWidth="1.5" fill="none"/><path d="M32 15 Q35 20 32 25" strokeLinecap="round" strokeWidth="1.5" fill="none"/></svg>
    case 'Panic Button':
      return <svg {...props}><rect x="6" y="12" width="28" height="16" rx="8" strokeWidth="1.5"/><circle cx="20" cy="20" r="5" fill="currentColor"/></svg>
    case 'Dual Tech Detector': case 'Shock Sensor':
      return <svg {...props}><rect x="6" y="12" width="28" height="16" rx="2" strokeWidth="1.5"/><path d="M12 20 Q16 15 20 20 Q24 25 28 20" strokeLinecap="round" strokeWidth="1.5" fill="none"/></svg>
    // Fire Alarm
    case 'Smoke Detector': case 'Duct Detector':
      return <svg {...props}><circle cx="20" cy="20" r="12" strokeWidth="1.5"/><circle cx="20" cy="20" r="5" strokeWidth="1.5"/><path d="M20 8 L20 4 M20 32 L20 36 M8 20 L4 20 M32 20 L36 20" strokeWidth="1.5" strokeLinecap="round"/></svg>
    case 'Heat Detector':
      return <svg {...props}><circle cx="20" cy="20" r="12" strokeWidth="1.5"/><path d="M15 22 Q15 14 20 14 Q25 14 25 22" strokeWidth="1.5" fill="none"/><path d="M13 26 L27 26" strokeWidth="1.5" strokeLinecap="round"/></svg>
    case 'Horn Strobe': case 'Horn': case 'Bell':
      return <svg {...props}><path d="M10 14 L10 26 L20 26 L30 32 L30 8 L20 14 Z" strokeWidth="1.5" fill="none"/><path d="M32 14 Q36 20 32 26" strokeWidth="1.5" strokeLinecap="round" fill="none"/><path d="M34 10 Q40 20 34 30" strokeWidth="1.2" strokeLinecap="round" fill="none"/></svg>
    case 'Strobe':
      return <svg {...props}><path d="M20 4 L20 36 M10 8 L30 8 M8 14 L32 14" strokeWidth="0" /><polygon points="14,6 26,6 28,14 12,14" strokeWidth="1.5" fill="none"/><path d="M8 18 L14 14 M26 14 L32 18" strokeWidth="1.2" strokeLinecap="round"/><path d="M20 14 L14 26 L20 22 L20 32 L26 20 L20 24 Z" fill="currentColor" strokeWidth="0"/></svg>
    case 'Pull Station':
      return <svg {...props}><rect x="10" y="6" width="20" height="28" rx="2" strokeWidth="1.5"/><rect x="13" y="10" width="14" height="10" rx="1" strokeWidth="1.5"/><path d="M14 26 L26 26 M14 30 L22 30" strokeWidth="1.2" strokeLinecap="round"/></svg>
    case 'CO Detector':
      return <svg {...props}><circle cx="20" cy="20" r="12" strokeWidth="1.5"/><path d="M14 22 Q14 16 17 15 Q20 14 22 16" strokeWidth="1.5" strokeLinecap="round" fill="none"/><path d="M22 16 Q26 14 26 20 Q26 26 22 24 Q18 22 18 20" strokeWidth="1.5" strokeLinecap="round" fill="none"/></svg>
    case 'Beam Detector':
      return <svg {...props}><rect x="4" y="14" width="8" height="12" rx="2" strokeWidth="1.5"/><rect x="28" y="14" width="8" height="12" rx="2" strokeWidth="1.5"/><path d="M12 17 L28 17 M12 20 L28 20 M12 23 L28 23" strokeDasharray="3 2" strokeWidth="1.2"/></svg>
    case 'Annunciator':
      return <svg {...props}><rect x="4" y="8" width="32" height="24" rx="2" strokeWidth="1.5"/><rect x="8" y="12" width="8" height="6" rx="1" strokeWidth="1"/><rect x="18" y="12" width="8" height="6" rx="1" strokeWidth="1"/><rect x="28" y="12" width="4" height="6" rx="1" strokeWidth="1"/><path d="M8 22 L32 22 M8 26 L24 26" strokeWidth="1.2" strokeLinecap="round"/></svg>
    case 'Monitor Module': case 'Control Module':
      return <svg {...props}><rect x="8" y="10" width="24" height="20" rx="2" strokeWidth="1.5"/><circle cx="15" cy="20" r="3" strokeWidth="1.5"/><path d="M8 20 L4 20 M32 20 L36 20" strokeWidth="1.5" strokeLinecap="round"/><path d="M22 16 L28 16 M22 20 L28 20 M22 24 L28 24" strokeWidth="1.2" strokeLinecap="round"/></svg>
    case 'Door Holder':
      return <svg {...props}><rect x="4" y="16" width="20" height="8" rx="2" strokeWidth="1.5"/><path d="M24 20 L32 20" strokeWidth="2" strokeLinecap="round"/><circle cx="34" cy="20" r="4" strokeWidth="1.5"/></svg>
    case 'Air Sampling':
      return <svg {...props}><rect x="4" y="14" width="32" height="12" rx="2" strokeWidth="1.5"/><path d="M10 14 L10 8 M16 14 L16 10 M22 14 L22 8 M28 14 L28 10" strokeWidth="1.2" strokeLinecap="round"/><path d="M8 20 Q12 17 16 20 Q20 23 24 20 Q28 17 32 20" strokeLinecap="round" strokeWidth="1.2" fill="none"/></svg>
    case 'Suppression Panel':
      return <svg {...props}><rect x="6" y="6" width="28" height="28" rx="2" strokeWidth="1.5"/><rect x="10" y="10" width="20" height="4" rx="1" strokeWidth="1"/><rect x="10" y="17" width="20" height="4" rx="1" strokeWidth="1"/><path d="M14 24 L20 30 L26 24" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" fill="none"/></svg>
    case 'FACP':
      return <svg {...props}><rect x="4" y="4" width="32" height="32" rx="2" strokeWidth="1.5"/><path d="M4 14 L36 14" strokeWidth="1.5"/><rect x="8" y="18" width="10" height="8" rx="1" strokeWidth="1.5"/><circle cx="28" cy="20" r="2" fill="currentColor"/><circle cx="28" cy="26" r="2" fill="currentColor"/><path d="M20 8 L20 10 M27 8 L27 10" strokeWidth="1.5" strokeLinecap="round"/></svg>
    // Network/Power
    case 'Network':
      return <svg {...props}><rect x="8" y="14" width="24" height="12" rx="2" strokeWidth="1.5"/><path d="M20 10 Q14 14 14 18 M20 10 Q26 14 26 18" strokeWidth="1.5" strokeLinecap="round" fill="none"/><circle cx="13" cy="20" r="1.5" fill="currentColor"/><circle cx="20" cy="20" r="1.5" fill="currentColor"/><circle cx="27" cy="20" r="1.5" fill="currentColor"/></svg>
    case 'UPS':
      return <svg {...props}><rect x="4" y="10" width="32" height="20" rx="2" strokeWidth="1.5"/><rect x="12" y="14" width="16" height="8" rx="1" strokeWidth="1.5"/><path d="M19 16 L17 20 L20 20 L21 24 L23 20 L20 20" fill="currentColor" strokeWidth="0.5"/></svg>
    case 'Panel': case 'Power Supply':
      return <svg {...props}><rect x="10" y="6" width="20" height="28" rx="2" strokeWidth="1.5"/><path d="M14 12 L26 12 M14 16 L26 16 M14 20 L26 20 M14 24 L26 24 M14 28 L22 28" strokeWidth="1" strokeLinecap="round"/></svg>
    case 'Rack': case 'Server':
      return <svg {...props}><rect x="8" y="4" width="24" height="32" rx="2" strokeWidth="1.5"/><rect x="10" y="8" width="20" height="5" rx="1" strokeWidth="1"/><rect x="10" y="15" width="20" height="5" rx="1" strokeWidth="1"/><rect x="10" y="22" width="20" height="5" rx="1" strokeWidth="1"/><circle cx="28" cy="10" r="1" fill="currentColor"/><circle cx="28" cy="17" r="1" fill="currentColor"/></svg>
    // AV
    case 'Display':
      return <svg {...props}><rect x="6" y="8" width="28" height="20" rx="2" strokeWidth="1.5"/><path d="M16 32 L24 32 M20 28 L20 32" strokeWidth="1.5" strokeLinecap="round"/></svg>
    case 'Ceiling Speaker': case 'Speaker': case 'Subwoofer':
      return <svg {...props}><circle cx="20" cy="20" r="12" strokeWidth="1.5"/><circle cx="20" cy="20" r="5" strokeWidth="1.5"/><circle cx="20" cy="20" r="2" fill="currentColor"/></svg>
    case 'AV Receiver':
      return <svg {...props}><rect x="4" y="12" width="32" height="16" rx="2" strokeWidth="1.5"/><rect x="8" y="16" width="10" height="8" rx="1" strokeWidth="1.5"/><circle cx="26" cy="20" r="4" strokeWidth="1.5"/></svg>
    case 'Control Processor': case 'Touch Panel':
      return <svg {...props}><rect x="4" y="10" width="32" height="20" rx="2" strokeWidth="1.5"/><rect x="8" y="14" width="10" height="8" rx="1" strokeWidth="1.5"/><circle cx="26" cy="17" r="2" fill="currentColor"/><circle cx="32" cy="17" r="2" fill="currentColor"/></svg>
    case 'Projector':
      return <svg {...props}><rect x="6" y="14" width="22" height="12" rx="2" strokeWidth="1.5"/><circle cx="22" cy="20" r="4" strokeWidth="1.5"/><path d="M28 17 L36 13 L36 27 L28 23" strokeWidth="1.5" fill="none"/></svg>
    case 'Media Player':
      return <svg {...props}><rect x="4" y="14" width="32" height="12" rx="3" strokeWidth="1.5"/><path d="M17 17 L17 23 L23 20 Z" fill="currentColor"/><circle cx="30" cy="20" r="2" fill="currentColor"/></svg>
    default:
      return <svg {...props}><rect x="10" y="10" width="20" height="20" rx="4" strokeWidth="1.5"/><circle cx="20" cy="20" r="4" strokeWidth="1.5"/></svg>
  }
}
