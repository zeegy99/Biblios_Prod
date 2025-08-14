import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Cookies, CookiesProvider } from 'react-cookie'
import './index.css'
import App from './App.jsx'




createRoot(document.getElementById('root')).render(
  <StrictMode>
    <CookiesProvider>
 <App />
    </CookiesProvider>
  </StrictMode>,
)
