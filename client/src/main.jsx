import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { installErrorReporter } from './services/errorReporter'

// Uncaught browser errors are reported to the Pusat Maintenance (AGENTS.md §22)
installErrorReporter()

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
