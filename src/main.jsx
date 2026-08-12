import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import App from './App.jsx'
import { ProfileProvider } from './context/ProfileContext'

// Auto-reload when a dynamic chunk fails to load after a new deployment
window.addEventListener('vite:preloadError', () => window.location.reload())

// Scope Windows-only scrollbar styles — Mac uses native overlay scrollbars that
// auto-hide and have no layout impact, so we leave those alone.
if (!navigator.userAgent.includes('Mac') && !navigator.userAgent.includes('iPhone') && !navigator.userAgent.includes('iPad')) {
  document.documentElement.classList.add('win-scroll')
}

// Apply saved theme before first paint to prevent flash
const savedTheme = localStorage.getItem('fp-theme') || 'dark'
document.documentElement.setAttribute('data-theme', savedTheme)

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <ProfileProvider>
        <App />
      </ProfileProvider>
    </BrowserRouter>
  </StrictMode>,
)