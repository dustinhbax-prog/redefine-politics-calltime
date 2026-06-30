import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { Capacitor } from '@capacitor/core'
import App from './App'
import PasswordGate from './components/PasswordGate'
import { MorphProvider } from './components/MorphOverlay'
import { SettingsProvider } from './contexts/SettingsContext'
import './index.css'

// In the native Call Time app (Capacitor), the bundled shell loads at '/'. Send
// it straight to the rolodex PWA (which is the whole point of that build) before
// React mounts, so the password gate is bypassed and the client app shows.
if (Capacitor.isNativePlatform() && window.location.pathname !== '/rolodex') {
  window.history.replaceState({}, '', '/rolodex')
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <SettingsProvider>
      <BrowserRouter>
        <MorphProvider>
          <PasswordGate>
            <App />
          </PasswordGate>
        </MorphProvider>
      </BrowserRouter>
    </SettingsProvider>
  </React.StrictMode>
)
