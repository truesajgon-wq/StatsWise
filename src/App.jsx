import { Component } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext.jsx'
import { LangProvider } from './context/LangContext.jsx'
import ProtectedRoute from './components/ProtectedRoute.jsx'
import LoginPage from './pages/LoginPage.jsx'
import SubscriptionPage from './pages/SubscriptionPage.jsx'
import HomePage from './pages/HomePage.jsx'
import MatchDetails from './pages/MatchDetails.jsx'
import TermsPage from './pages/TermsPage.jsx'
import PrivacyPage from './pages/PrivacyPage.jsx'
import ResponsibleGamblingPage from './pages/ResponsibleGamblingPage.jsx'

class AppErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  render() {
    if (this.state.error) {
      return (
        <div className="theme-page" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
            <div className="theme-card" style={{ maxWidth: 760, width: '100%', border: '1px solid rgba(239,68,68,0.35)', background: 'linear-gradient(180deg, rgba(80,14,14,0.42), rgba(17,18,20,0.98))', padding: 16 }}>
            <div style={{ fontSize: 18, fontWeight: 800, color: '#f87171', marginBottom: 8 }}>Application Error</div>
            <div style={{ fontSize: 13, marginBottom: 10, color: 'var(--sw-text-soft)' }}>A runtime error occurred. Refresh and try again.</div>
            <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontSize: 12, margin: 0 }}>If the problem continues, contact support.</pre>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

export default function App() {
  return (
    <LangProvider>
      <AuthProvider>
        <AppErrorBoundary>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/" element={<HomePage />} />
            <Route path="/terms" element={<TermsPage />} />
            <Route path="/privacy" element={<PrivacyPage />} />
            <Route path="/responsible-gambling" element={<ResponsibleGamblingPage />} />
            <Route
              path="/match/:id"
              element={
                <ProtectedRoute>
                  <MatchDetails />
                </ProtectedRoute>
              }
            />
            <Route
              path="/subscription"
              element={
                <ProtectedRoute>
                  <SubscriptionPage />
                </ProtectedRoute>
              }
            />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </AppErrorBoundary>
      </AuthProvider>
    </LangProvider>
  )
}
