import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { registerSW } from 'virtual:pwa-register'
import App from './App.tsx'

// autoUpdate: a new deploy's service worker takes over and the page reloads onto it.
// A home-screen app can stay open for days, so also look for a new deploy every
// 10 minutes and whenever the app comes back to the foreground.
registerSW({
  immediate: true,
  onRegisteredSW(_url, reg) {
    if (!reg) return
    const check = () => {
      if (navigator.onLine) void reg.update()
    }
    setInterval(check, 10 * 60 * 1000)
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') check()
    })
  },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
