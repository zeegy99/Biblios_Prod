import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Cookies, CookiesProvider } from 'react-cookie'
import './index.css'
import App from './App.jsx'
import AuthProvider from './auth/auth_provider.jsx'




createRoot(document.getElementById('root')).render(
  <StrictMode>
    <CookiesProvider>
      <AuthProvider>
        <App />
      </AuthProvider>
    </CookiesProvider>
  </StrictMode>,
)
