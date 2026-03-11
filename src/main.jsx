import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import 'flag-icons/css/flag-icons.min.css'
import './index.css'

function renderFatal(message) {
  const el = document.getElementById('root')
  if (!el) return
  el.innerHTML = `
    <div style="min-height:100vh;display:flex;align-items:center;justify-content:center;background:#0f172a;color:#e5e7eb;padding:20px;font-family:system-ui,sans-serif;">
      <div style="max-width:760px;width:100%;border:1px solid rgba(239,68,68,0.35);background:rgba(239,68,68,0.08);border-radius:12px;padding:16px;">
        <div style="font-size:18px;font-weight:800;color:#f87171;margin-bottom:8px;">Startup Error</div>
        <div style="font-size:13px;margin-bottom:10px;">Something went wrong while starting the app. Refresh and try again.</div>
        <pre style="white-space:pre-wrap;word-break:break-word;font-size:12px;margin:0;">If the problem continues, contact support.</pre>
      </div>
    </div>
  `
}

window.addEventListener('error', (e) => {
  renderFatal(e?.error?.stack || e?.error?.message || e?.message || 'Unknown error')
})

window.addEventListener('unhandledrejection', (e) => {
  const reason = e?.reason
  renderFatal(reason?.stack || reason?.message || String(reason))
})

async function bootstrap() {
  try {
    const mod = await import('./App.jsx')
    const App = mod.default
    ReactDOM.createRoot(document.getElementById('root')).render(
      <React.StrictMode>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </React.StrictMode>,
    )
  } catch (err) {
    renderFatal(err?.stack || err?.message || String(err))
  }
}

bootstrap()
