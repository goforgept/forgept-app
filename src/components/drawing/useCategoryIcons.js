import { useState, useEffect } from 'react'

// ─── SVG paths per category ───────────────────────────────────────────────────
// Each returns an SVG string at 40x40 viewBox
// Color is injected at render time so icons work in both
// the symbol picker (colored) and on the Konva canvas (white on orange)
const CATEGORY_SVGS = {
  'Dome Camera': (color) => `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40" fill="none" stroke="${color}" stroke-width="1.5">
      <ellipse cx="20" cy="24" rx="14" ry="6"/>
      <path d="M6 24 Q6 10 20 10 Q34 10 34 24" fill="none"/>
      <circle cx="20" cy="20" r="4"/>
    </svg>`,

  'Bullet Camera': (color) => `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40" fill="none" stroke="${color}" stroke-width="1.5">
      <rect x="8" y="16" width="20" height="8" rx="2"/>
      <path d="M28 18 L34 16 L34 24 L28 22 Z" fill="none"/>
      <circle cx="13" cy="20" r="2"/>
    </svg>`,

  'PTZ Camera': (color) => `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40" fill="none" stroke="${color}" stroke-width="1.5" stroke-linecap="round">
      <circle cx="20" cy="20" r="10"/>
      <circle cx="20" cy="20" r="4"/>
      <path d="M20 8 L20 4 M20 36 L20 32 M8 20 L4 20 M36 20 L32 20"/>
    </svg>`,

  'Access Reader': (color) => `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40" fill="none" stroke="${color}" stroke-width="1.5">
      <rect x="10" y="8" width="20" height="24" rx="3"/>
      <rect x="15" y="13" width="10" height="7" rx="1"/>
      <circle cx="20" cy="26" r="2"/>
    </svg>`,

  'Controller': (color) => `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40" fill="none" stroke="${color}" stroke-width="1.5">
      <rect x="6" y="12" width="28" height="16" rx="2"/>
      <circle cx="13" cy="20" r="2" fill="${color}"/>
      <circle cx="20" cy="20" r="2" fill="${color}"/>
      <circle cx="27" cy="20" r="2" fill="${color}"/>
    </svg>`,

  'Motion Sensor': (color) => `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40" fill="none" stroke="${color}" stroke-width="1.5" stroke-linecap="round">
      <path d="M20 20 L8 10 M20 20 L8 30 M20 20 L32 20"/>
      <circle cx="20" cy="20" r="3"/>
      <path d="M26 14 Q32 20 26 26" fill="none"/>
    </svg>`,

  'NVR': (color) => `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40" fill="none" stroke="${color}" stroke-width="1.5">
      <rect x="6" y="10" width="28" height="20" rx="2"/>
      <rect x="10" y="14" width="8" height="6" rx="1"/>
      <rect x="22" y="14" width="8" height="6" rx="1"/>
    </svg>`,

  'Display': (color) => `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40" fill="none" stroke="${color}" stroke-width="1.5" stroke-linecap="round">
      <rect x="6" y="8" width="28" height="20" rx="2"/>
      <path d="M16 32 L24 32 M20 28 L20 32"/>
    </svg>`,

  'Speaker': (color) => `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40" fill="none" stroke="${color}" stroke-width="1.5">
      <circle cx="20" cy="20" r="12"/>
      <circle cx="20" cy="20" r="5"/>
      <circle cx="20" cy="20" r="2" fill="${color}"/>
    </svg>`,

  'Network': (color) => `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40" fill="none" stroke="${color}" stroke-width="1.5" stroke-linecap="round">
      <rect x="8" y="14" width="24" height="12" rx="2"/>
      <path d="M20 10 Q14 14 14 18 M20 10 Q26 14 26 18" fill="none"/>
    </svg>`,

  'Thermostat': (color) => `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40" fill="none" stroke="${color}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="20" cy="20" r="12"/>
      <path d="M20 14 L20 20 L24 24"/>
      <circle cx="20" cy="20" r="2" fill="${color}"/>
    </svg>`,

  'Diffuser': (color) => `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40" fill="none" stroke="${color}" stroke-width="1.5">
      <rect x="8" y="8" width="24" height="24" rx="2"/>
      <path d="M14 14 L26 14 M14 20 L26 20 M14 26 L26 26" stroke-width="1" stroke-dasharray="2 2"/>
      <path d="M14 14 L14 26 M20 14 L20 26 M26 14 L26 26" stroke-width="1" stroke-dasharray="2 2"/>
    </svg>`,

  'Outlet': (color) => `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40" fill="none" stroke="${color}" stroke-width="1.5" stroke-linecap="round">
      <rect x="10" y="8" width="20" height="24" rx="3"/>
      <path d="M17 16 L17 20 M23 16 L23 20" stroke-width="2"/>
      <path d="M17 24 Q20 27 23 24" fill="none"/>
    </svg>`,

  'Panel': (color) => `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40" fill="none" stroke="${color}" stroke-width="1.5" stroke-linecap="round">
      <rect x="10" y="6" width="20" height="28" rx="2"/>
      <path d="M14 12 L26 12 M14 16 L26 16 M14 20 L26 20 M14 24 L26 24 M14 28 L22 28" stroke-width="1"/>
    </svg>`,

  'Lighting': (color) => `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40" fill="none" stroke="${color}" stroke-width="1.5" stroke-linecap="round">
      <circle cx="20" cy="18" r="8"/>
      <path d="M17 26 L23 26 M18 29 L22 29"/>
      <path d="M20 6 L20 4 M28 10 L30 8 M32 18 L34 18 M12 10 L10 8 M8 18 L6 18"/>
    </svg>`,

  'Smoke Detector': (color) => `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40" fill="none" stroke="${color}" stroke-width="1.5">
      <circle cx="20" cy="20" r="12"/>
      <circle cx="20" cy="20" r="5"/>
      <path d="M20 8 L20 4 M32 20 L36 20" stroke-linecap="round"/>
    </svg>`,

  'Heat Detector': (color) => `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40" fill="none" stroke="${color}" stroke-width="1.5" stroke-linecap="round">
      <circle cx="20" cy="20" r="12"/>
      <path d="M15 20 L25 20 M20 15 L20 25"/>
    </svg>`,

  'Horn Strobe': (color) => `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40" fill="none" stroke="${color}" stroke-width="1.5" stroke-linecap="round">
      <rect x="8" y="12" width="14" height="16" rx="2"/>
      <path d="M22 14 L32 8 L32 32 L22 26 Z" fill="none"/>
      <path d="M28 18 L34 15 M28 22 L34 25" stroke-width="1"/>
    </svg>`,

  'Pull Station': (color) => `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40" fill="none" stroke="${color}" stroke-width="1.5">
      <rect x="10" y="8" width="20" height="24" rx="2"/>
      <rect x="14" y="12" width="12" height="8" rx="1"/>
      <path d="M17 26 L23 26" stroke-linecap="round"/>
      <path d="M20 30 L20 34" stroke-linecap="round"/>
    </svg>`,

  'FACP': (color) => `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40" fill="none" stroke="${color}" stroke-width="1.5">
      <rect x="4" y="8" width="32" height="24" rx="2"/>
      <rect x="8" y="12" width="10" height="8" rx="1"/>
      <circle cx="26" cy="16" r="2" fill="${color}"/>
      <circle cx="32" cy="16" r="2" fill="${color}"/>
      <path d="M8 24 L32 24 M8 28 L20 28" stroke-linecap="round" stroke-width="1"/>
    </svg>`,

  'Duct Detector': (color) => `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40" fill="none" stroke="${color}" stroke-width="1.5">
      <rect x="4" y="14" width="32" height="12" rx="2"/>
      <circle cx="20" cy="20" r="4"/>
      <path d="M20 4 L20 14 M20 26 L20 36" stroke-linecap="round"/>
    </svg>`,

  'Amplifier': (color) => `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40" fill="none" stroke="${color}" stroke-width="1.5">
      <rect x="4" y="10" width="32" height="20" rx="2"/>
      <path d="M10 20 L16 14 L16 26 Z" fill="${color}" stroke="none"/>
      <circle cx="28" cy="20" r="4"/>
    </svg>`,

  'DSP': (color) => `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40" fill="none" stroke="${color}" stroke-width="1.5">
      <rect x="6" y="10" width="28" height="20" rx="2"/>
      <path d="M10 20 Q14 14 18 20 Q22 26 26 20 Q28 17 30 20" stroke-linecap="round" fill="none"/>
    </svg>`,

  'Switcher': (color) => `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40" fill="none" stroke="${color}" stroke-width="1.5">
      <rect x="4" y="12" width="32" height="16" rx="2"/>
      <circle cx="11" cy="20" r="2" fill="${color}"/>
      <circle cx="20" cy="20" r="2" fill="${color}"/>
      <circle cx="29" cy="20" r="2" fill="${color}"/>
      <path d="M8 12 L8 8 M20 12 L20 8 M32 12 L32 8" stroke-linecap="round"/>
    </svg>`,

  'Rack': (color) => `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40" fill="none" stroke="${color}" stroke-width="1.5">
      <rect x="8" y="4" width="24" height="32" rx="2"/>
      <path d="M8 10 L32 10 M8 16 L32 16 M8 22 L32 22 M8 28 L32 28" stroke-width="1"/>
      <circle cx="12" cy="13" r="1.5" fill="${color}"/>
      <circle cx="12" cy="19" r="1.5" fill="${color}"/>
      <circle cx="12" cy="25" r="1.5" fill="${color}"/>
    </svg>`,

  'UPS': (color) => `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40" fill="none" stroke="${color}" stroke-width="1.5">
      <rect x="6" y="8" width="28" height="24" rx="2"/>
      <path d="M20 14 L16 20 L20 20 L20 26 L24 20 L20 20" fill="${color}" stroke="none"/>
    </svg>`,

  'Fiber Panel': (color) => `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40" fill="none" stroke="${color}" stroke-width="1.5">
      <rect x="4" y="14" width="32" height="12" rx="2"/>
      <circle cx="12" cy="20" r="2"/>
      <circle cx="20" cy="20" r="2"/>
      <circle cx="28" cy="20" r="2"/>
    </svg>`,

  'Cable Tray': (color) => `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40" fill="none" stroke="${color}" stroke-width="1.5" stroke-linecap="round">
      <path d="M4 16 L4 28 L36 28 L36 16"/>
      <path d="M4 16 L36 16"/>
      <path d="M10 16 L10 28 M16 16 L16 28 M22 16 L22 28 M28 16 L28 28" stroke-width="1"/>
    </svg>`,

  'Conduit': (color) => `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40" fill="none" stroke="${color}" stroke-width="1.5" stroke-linecap="round">
      <path d="M8 20 L32 20"/>
      <ellipse cx="8" cy="20" rx="4" ry="8"/>
      <ellipse cx="32" cy="20" rx="4" ry="8"/>
    </svg>`,

  'Junction Box': (color) => `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40" fill="none" stroke="${color}" stroke-width="1.5">
      <rect x="8" y="8" width="24" height="24" rx="2"/>
      <path d="M20 8 L20 4 M32 20 L36 20 M20 32 L20 36 M8 20 L4 20" stroke-linecap="round"/>
    </svg>`,

  'Disconnect': (color) => `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40" fill="none" stroke="${color}" stroke-width="1.5" stroke-linecap="round">
      <rect x="8" y="8" width="24" height="24" rx="2"/>
      <path d="M20 12 L20 20"/>
      <path d="M14 28 L26 28"/>
      <circle cx="20" cy="22" r="2" fill="${color}"/>
    </svg>`,

  'Data Drop': (color) => `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40" fill="none" stroke="${color}" stroke-width="1.5">
      <rect x="12" y="6" width="16" height="28" rx="2"/>
      <path d="M12 14 L6 14 M12 20 L6 20 M12 26 L6 26" stroke-linecap="round"/>
    </svg>`,

  'Patch Panel': (color) => `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40" fill="none" stroke="${color}" stroke-width="1.5">
      <rect x="4" y="14" width="32" height="12" rx="2"/>
      <rect x="8" y="17" width="4" height="6" rx="1"/>
      <rect x="14" y="17" width="4" height="6" rx="1"/>
      <rect x="20" y="17" width="4" height="6" rx="1"/>
      <rect x="26" y="17" width="4" height="6" rx="1"/>
    </svg>`,

  'Access Control Door': (color) => `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40" fill="none" stroke="${color}" stroke-width="1.5">
      <rect x="8" y="4" width="24" height="32" rx="2"/>
      <circle cx="26" cy="20" r="2" fill="${color}"/>
      <path d="M8 4 L8 36" stroke-width="1"/>
      <path d="M14 8 L14 32" stroke-width="0.5" stroke-dasharray="2 2"/>
    </svg>`,

  'Multi-Lens Camera': (color) => `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40" fill="none" stroke="${color}" stroke-width="1.5">
      <rect x="4" y="14" width="32" height="12" rx="2"/>
      <circle cx="12" cy="20" r="3"/>
      <circle cx="20" cy="20" r="3"/>
      <circle cx="28" cy="20" r="3"/>
      <path d="M4 14 L4 10 M36 14 L36 10" stroke-linecap="round"/>
    </svg>`,

  'Fisheye Camera': (color) => `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40" fill="none" stroke="${color}" stroke-width="1.5">
      <circle cx="20" cy="20" r="14"/>
      <circle cx="20" cy="20" r="8"/>
      <circle cx="20" cy="20" r="3" fill="${color}"/>
      <path d="M6 20 Q20 8 34 20 Q20 32 6 20" stroke-width="1" opacity="0.5"/>
    </svg>`,

  'Wireless Lock': (color) => `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40" fill="none" stroke="${color}" stroke-width="1.5">
      <rect x="12" y="18" width="16" height="14" rx="2"/>
      <path d="M16 18v-5a4 4 0 0 1 8 0v5"/>
      <circle cx="20" cy="25" r="2" fill="${color}"/>
      <path d="M8 12 Q8 6 20 6 Q32 6 32 12" stroke-width="1" opacity="0.5"/>
      <path d="M11 15 Q11 10 20 10 Q29 10 29 15" stroke-width="1" opacity="0.7"/>
    </svg>`,

  'Intercom': (color) => `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40" fill="none" stroke="${color}" stroke-width="1.5">
      <rect x="10" y="6" width="20" height="28" rx="3"/>
      <circle cx="20" cy="14" r="4"/>
      <rect x="14" y="20" width="12" height="8" rx="1"/>
      <circle cx="20" cy="24" r="1.5" fill="${color}"/>
    </svg>`,

  'Sensor': (color) => `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40" fill="none" stroke="${color}" stroke-width="1.5" stroke-linecap="round">
      <circle cx="20" cy="20" r="5"/>
      <path d="M10 20 Q10 10 20 10 Q30 10 30 20" fill="none"/>
      <path d="M6 24 Q4 12 20 6 Q36 12 34 24" fill="none"/>
      <circle cx="20" cy="20" r="2" fill="${color}"/>
    </svg>`,

  'LPR Camera': (color) => `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40" fill="none" stroke="${color}" stroke-width="1.5">
      <rect x="4" y="14" width="24" height="12" rx="2"/>
      <path d="M28 17 L36 14 L36 26 L28 23 Z" fill="none"/>
      <rect x="8" y="17" width="10" height="6" rx="1"/>
      <path d="M10 34 L30 34" stroke-width="1" stroke-dasharray="2 2"/>
    </svg>`,

  'Alarm Keypad': (color) => `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40" fill="none" stroke="${color}" stroke-width="1.5">
      <rect x="10" y="4" width="20" height="32" rx="2"/>
      <rect x="13" y="7" width="14" height="8" rx="1"/>
      <circle cx="15" cy="20" r="1.5" fill="${color}" stroke="none"/>
      <circle cx="20" cy="20" r="1.5" fill="${color}" stroke="none"/>
      <circle cx="25" cy="20" r="1.5" fill="${color}" stroke="none"/>
      <circle cx="15" cy="25" r="1.5" fill="${color}" stroke="none"/>
      <circle cx="20" cy="25" r="1.5" fill="${color}" stroke="none"/>
      <circle cx="25" cy="25" r="1.5" fill="${color}" stroke="none"/>
      <circle cx="15" cy="30" r="1.5" fill="${color}" stroke="none"/>
      <circle cx="20" cy="30" r="1.5" fill="${color}" stroke="none"/>
      <circle cx="25" cy="30" r="1.5" fill="${color}" stroke="none"/>
    </svg>`,

  'Alarm Panel': (color) => `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40" fill="none" stroke="${color}" stroke-width="1.5">
      <rect x="4" y="6" width="32" height="28" rx="2"/>
      <rect x="8" y="10" width="16" height="10" rx="1"/>
      <circle cx="30" cy="13" r="2" fill="${color}" stroke="none"/>
      <circle cx="30" cy="19" r="2" fill="${color}" stroke="none"/>
      <path d="M8 24 L24 24 M8 28 L18 28" stroke-linecap="round" stroke-width="1"/>
    </svg>`,

  'Door Contact': (color) => `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40" fill="none" stroke="${color}" stroke-width="1.5">
      <rect x="5" y="8" width="11" height="24" rx="2"/>
      <rect x="24" y="8" width="11" height="24" rx="2"/>
      <path d="M16 14 L24 14 M16 26 L24 26" stroke-width="1" stroke-dasharray="2 2"/>
    </svg>`,

  'PIR Detector': (color) => `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40" fill="none" stroke="${color}" stroke-width="1.5">
      <path d="M6 32 Q6 14 20 10 Q34 14 34 32 Z" fill="none"/>
      <path d="M12 26 Q12 18 20 16 Q28 18 28 26" fill="none" stroke-width="1" stroke-dasharray="2 2"/>
      <circle cx="20" cy="30" r="2" fill="${color}" stroke="none"/>
    </svg>`,

  'Dual Tech Detector': (color) => `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40" fill="none" stroke="${color}" stroke-width="1.5">
      <rect x="6" y="12" width="28" height="16" rx="2"/>
      <path d="M12 20 Q16 15 20 20 Q24 25 28 20" stroke-linecap="round" fill="none"/>
      <path d="M6 32 L10 28 M34 32 L30 28" stroke-linecap="round" stroke-width="1"/>
    </svg>`,

  'Glass Break': (color) => `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40" fill="none" stroke="${color}" stroke-width="1.5">
      <circle cx="20" cy="20" r="13"/>
      <path d="M20 7 L17 14 L22 14 L16 22 M22 14 L26 19" stroke-linecap="round" stroke-linejoin="round"/>
      <circle cx="20" cy="20" r="2" fill="${color}" stroke="none"/>
    </svg>`,

  'Interior Siren': (color) => `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40" fill="none" stroke="${color}" stroke-width="1.5">
      <rect x="12" y="12" width="16" height="16" rx="2"/>
      <path d="M8 15 Q5 20 8 25" fill="none" stroke-linecap="round"/>
      <path d="M32 15 Q35 20 32 25" fill="none" stroke-linecap="round"/>
      <path d="M5 12 Q2 20 5 28" fill="none" stroke-linecap="round" stroke-width="1"/>
      <path d="M35 12 Q38 20 35 28" fill="none" stroke-linecap="round" stroke-width="1"/>
    </svg>`,

  'Exterior Siren': (color) => `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40" fill="none" stroke="${color}" stroke-width="1.5">
      <rect x="10" y="8" width="20" height="14" rx="2"/>
      <circle cx="20" cy="30" r="6"/>
      <circle cx="20" cy="30" r="2.5" fill="${color}" stroke="none"/>
      <path d="M7 11 Q4 15 7 19" fill="none" stroke-linecap="round"/>
      <path d="M33 11 Q36 15 33 19" fill="none" stroke-linecap="round"/>
    </svg>`,

  'Panic Button': (color) => `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40" fill="none" stroke="${color}" stroke-width="1.5">
      <rect x="6" y="12" width="28" height="16" rx="8"/>
      <circle cx="20" cy="20" r="5" fill="${color}" stroke="none"/>
    </svg>`,

  'Shock Sensor': (color) => `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40" fill="none" stroke="${color}" stroke-width="1.5">
      <circle cx="20" cy="20" r="8"/>
      <path d="M9 11 Q6 9 8 6 M31 11 Q34 9 32 6 M9 29 Q6 31 8 34 M31 29 Q34 31 32 34" stroke-linecap="round" stroke-width="1"/>
      <circle cx="20" cy="20" r="3" fill="${color}" stroke="none"/>
    </svg>`,

  'Guard Tour': (color) => `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40" fill="none" stroke="${color}" stroke-width="1.5" stroke-linecap="round">
      <rect x="14" y="4" width="12" height="22" rx="3"/>
      <circle cx="20" cy="10" r="3"/>
      <path d="M17 16 L23 16 M17 20 L23 20"/>
      <path d="M10 30 Q10 36 20 36 Q30 36 30 30"/>
      <circle cx="20" cy="30" r="3" fill="${color}"/>
    </svg>`,

  'Projector': (color) => `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40" fill="none" stroke="${color}" stroke-width="1.5">
      <rect x="6" y="14" width="22" height="12" rx="2"/>
      <circle cx="22" cy="20" r="4"/>
      <circle cx="22" cy="20" r="1.5" fill="${color}" stroke="none"/>
      <path d="M28 17 L36 13 L36 27 L28 23" fill="none"/>
      <circle cx="10" cy="18" r="1" fill="${color}" stroke="none"/>
      <circle cx="10" cy="22" r="1" fill="${color}" stroke="none"/>
    </svg>`,

  'Projection Screen': (color) => `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40" fill="none" stroke="${color}" stroke-width="1.5">
      <path d="M4 8 L36 8" stroke-linecap="round" stroke-width="2"/>
      <rect x="8" y="8" width="24" height="20" rx="1"/>
      <path d="M16 28 L16 36 M24 28 L24 36" stroke-linecap="round"/>
      <path d="M20 6 L20 4" stroke-linecap="round"/>
    </svg>`,

  'Touch Panel': (color) => `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40" fill="none" stroke="${color}" stroke-width="1.5">
      <rect x="8" y="4" width="24" height="32" rx="3"/>
      <rect x="11" y="8" width="18" height="20" rx="1"/>
      <circle cx="20" cy="32" r="2"/>
      <path d="M20 14 L20 18 M18 16 L22 16" stroke-linecap="round" stroke-width="1"/>
    </svg>`,

  'Control Processor': (color) => `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40" fill="none" stroke="${color}" stroke-width="1.5">
      <rect x="4" y="10" width="32" height="20" rx="2"/>
      <rect x="8" y="14" width="10" height="8" rx="1"/>
      <circle cx="26" cy="17" r="2" fill="${color}" stroke="none"/>
      <circle cx="32" cy="17" r="2" fill="${color}" stroke="none"/>
      <path d="M22 24 L36 24 M8 26 L18 26" stroke-width="1" stroke-linecap="round"/>
    </svg>`,

  'Ceiling Speaker': (color) => `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40" fill="none" stroke="${color}" stroke-width="1.5">
      <circle cx="20" cy="20" r="14"/>
      <circle cx="20" cy="20" r="8"/>
      <circle cx="20" cy="20" r="3" fill="${color}" stroke="none"/>
      <path d="M20 6 L20 2 M34 20 L38 20 M20 34 L20 38 M6 20 L2 20" stroke-linecap="round" stroke-width="1"/>
    </svg>`,

  'Subwoofer': (color) => `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40" fill="none" stroke="${color}" stroke-width="1.5">
      <rect x="6" y="8" width="28" height="24" rx="2"/>
      <circle cx="20" cy="20" r="9"/>
      <circle cx="20" cy="20" r="4"/>
      <circle cx="20" cy="20" r="1.5" fill="${color}" stroke="none"/>
    </svg>`,

  'Microphone': (color) => `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40" fill="none" stroke="${color}" stroke-width="1.5" stroke-linecap="round">
      <rect x="14" y="4" width="12" height="18" rx="6"/>
      <path d="M8 20 Q8 30 20 30 Q32 30 32 20" fill="none"/>
      <path d="M20 30 L20 36"/>
      <path d="M14 36 L26 36"/>
    </svg>`,

  'Wireless Mic': (color) => `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40" fill="none" stroke="${color}" stroke-width="1.5" stroke-linecap="round">
      <rect x="14" y="14" width="12" height="20" rx="6"/>
      <ellipse cx="20" cy="14" rx="6" ry="4"/>
      <path d="M28 12 Q32 17 28 22" fill="none" stroke-width="1"/>
      <path d="M31 9 Q37 17 31 25" fill="none" stroke-width="1"/>
    </svg>`,

  'Video Conference': (color) => `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40" fill="none" stroke="${color}" stroke-width="1.5">
      <rect x="4" y="10" width="28" height="18" rx="2"/>
      <path d="M32 14 L38 11 L38 29 L32 26 Z" fill="none"/>
      <path d="M14 28 L14 34 M26 28 L26 34" stroke-linecap="round"/>
      <path d="M10 34 L30 34" stroke-linecap="round"/>
    </svg>`,

  'Media Player': (color) => `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40" fill="none" stroke="${color}" stroke-width="1.5">
      <rect x="4" y="14" width="32" height="12" rx="3"/>
      <path d="M17 17 L17 23 L23 20 Z" fill="${color}" stroke="none"/>
      <circle cx="30" cy="20" r="2" fill="${color}" stroke="none"/>
    </svg>`,

  'HDMI Extender': (color) => `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40" fill="none" stroke="${color}" stroke-width="1.5">
      <rect x="2" y="14" width="12" height="12" rx="2"/>
      <rect x="26" y="14" width="12" height="12" rx="2"/>
      <path d="M14 20 L26 20" stroke-dasharray="2 2"/>
      <path d="M8 17 L8 23 M32 17 L32 23" stroke-linecap="round"/>
    </svg>`,

  'AV Receiver': (color) => `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40" fill="none" stroke="${color}" stroke-width="1.5">
      <rect x="4" y="12" width="32" height="16" rx="2"/>
      <rect x="8" y="16" width="10" height="8" rx="1"/>
      <circle cx="26" cy="20" r="4"/>
      <circle cx="26" cy="20" r="1.5" fill="${color}" stroke="none"/>
      <circle cx="34" cy="16" r="1" fill="${color}" stroke="none"/>
    </svg>`,

  'Clock': (color) => `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40" fill="none" stroke="${color}" stroke-width="1.5" stroke-linecap="round">
      <circle cx="20" cy="20" r="14"/>
      <path d="M20 10 L20 20 L26 26"/>
      <circle cx="20" cy="20" r="1.5" fill="${color}" stroke="none"/>
      <path d="M20 8 L20 6 M32 20 L34 20 M20 32 L20 34 M8 20 L6 20" stroke-width="1"/>
    </svg>`,

  'Document Camera': (color) => `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40" fill="none" stroke="${color}" stroke-width="1.5" stroke-linecap="round">
      <rect x="6" y="30" width="28" height="6" rx="2"/>
      <path d="M20 30 L20 16"/>
      <path d="M20 16 L30 10"/>
      <circle cx="32" cy="10" r="4"/>
      <circle cx="32" cy="10" r="1.5" fill="${color}" stroke="none"/>
    </svg>`,

  'Streaming Encoder': (color) => `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40" fill="none" stroke="${color}" stroke-width="1.5">
      <rect x="4" y="12" width="32" height="16" rx="2"/>
      <path d="M10 22 Q13 16 16 22 Q19 28 22 22 Q24 18 26 22" stroke-linecap="round" fill="none"/>
      <circle cx="32" cy="18" r="2" fill="${color}" stroke="none"/>
    </svg>`,

  'Digital Signage': (color) => `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40" fill="none" stroke="${color}" stroke-width="1.5" stroke-linecap="round">
      <rect x="4" y="6" width="32" height="22" rx="2"/>
      <path d="M15 32 L25 32 M20 28 L20 32"/>
      <path d="M9 11 L31 11 M9 15 L24 15 M9 19 L20 19"/>
    </svg>`,

  'Wall Plate': (color) => `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40" fill="none" stroke="${color}" stroke-width="1.5">
      <rect x="10" y="6" width="20" height="28" rx="2"/>
      <rect x="14" y="11" width="12" height="7" rx="1"/>
      <rect x="14" y="22" width="12" height="7" rx="1"/>
    </svg>`,

  'Door Operator': (color) => `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40" fill="none" stroke="${color}" stroke-width="1.5" stroke-linecap="round">
      <path d="M6 6 L6 32"/>
      <path d="M6 32 A26 26 0 0 0 32 6" stroke-dasharray="3 3" stroke-width="1"/>
      <rect x="28" y="2" width="10" height="8" rx="1"/>
      <circle cx="33" cy="6" r="2" fill="${color}" stroke="none"/>
    </svg>`,

  'Point to Point': (color) => `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40" fill="none" stroke="${color}" stroke-width="1.5" stroke-linecap="round">
      <rect x="2" y="15" width="8" height="10" rx="1"/>
      <path d="M10 18 L15 20 L10 22 Z" fill="${color}" stroke="none"/>
      <path d="M15 20 L25 20" stroke-dasharray="2 2"/>
      <path d="M30 18 L25 20 L30 22 Z" fill="${color}" stroke="none"/>
      <rect x="30" y="15" width="8" height="10" rx="1"/>
      <path d="M6 25 L6 38"/>
      <path d="M34 25 L34 38"/>
    </svg>`,

  'Power Box': (color) => `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40" fill="none" stroke="${color}" stroke-width="1.5">
      <rect x="4" y="6" width="32" height="26" rx="3"/>
      <path d="M4 14 L36 14"/>
      <path d="M21 18 L17 24 L20 24 L20 29 L24 23 L21 23 Z" fill="${color}" stroke="none"/>
      <rect x="6" y="27" width="4" height="3" rx="0.5"/>
      <rect x="12" y="27" width="4" height="3" rx="0.5"/>
      <circle cx="31" cy="24" r="2.5"/>
      <path d="M29 24 L29 21 Q29 19 31 19 Q33 19 33 21 L33 24" stroke-width="1.2"/>
    </svg>`,

  'default': (color) => `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40" fill="none" stroke="${color}" stroke-width="1.5">
      <rect x="10" y="10" width="20" height="20" rx="4"/>
      <circle cx="20" cy="20" r="4"/>
    </svg>`,
}

// ─── Cache for rendered icon images ───────────────────────────────────────────
const iconCache = new Map()

// ─── Render SVG string to HTMLImageElement ─────────────────────────────────────
function svgToImage(svgString, size = 40) {
  return new Promise((resolve) => {
    const blob   = new Blob([svgString], { type: 'image/svg+xml' })
    const url    = URL.createObjectURL(blob)
    const img    = new window.Image(size, size)
    img.onload   = () => { URL.revokeObjectURL(url); resolve(img) }
    img.onerror  = () => { URL.revokeObjectURL(url); resolve(null) }
    img.src      = url
  })
}

// ─── useCategoryIcons hook ────────────────────────────────────────────────────
// Pre-renders all category icons to HTMLImageElements for use in Konva.
// Returns a function getIcon(category) → HTMLImageElement | null
export function useCategoryIcons(color = 'white', size = 40) {
  const [icons, setIcons] = useState({})

  useEffect(() => {
    const cacheKey = `${color}_${size}`
    if (iconCache.has(cacheKey)) {
      setIcons(iconCache.get(cacheKey))
      return
    }

    const render = async () => {
      const result = {}
      const entries = Object.entries(CATEGORY_SVGS)
      await Promise.all(
        entries.map(async ([category, svgFn]) => {
          const img = await svgToImage(svgFn(color), size)
          if (img) result[category] = img
        })
      )
      iconCache.set(cacheKey, result)
      setIcons(result)
    }

    render()
  }, [color, size])

  const getIcon = (category) => icons[category] || icons['default'] || null

  return { icons, getIcon, ready: Object.keys(icons).length > 0 }
}

// ─── Export SVG string getter for direct use ──────────────────────────────────
export function getCategorySVG(category, color = 'white') {
  const fn = CATEGORY_SVGS[category] || CATEGORY_SVGS['default']
  return fn(color)
}