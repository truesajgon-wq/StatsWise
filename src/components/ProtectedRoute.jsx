import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'

// Redirects to /login if not authenticated.
// If requireSubscription=true, redirects free users to /subscription.
export default function ProtectedRoute({ children, requireSubscription = false }) {
  const { user, isSubscribed, initializing } = useAuth()

  if (initializing) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--sw-bg)', color: 'var(--sw-text)' }}>
        Loading...
      </div>
    )
  }

  if (!user) {
    return <Navigate to="/login" replace />
  }

  if (requireSubscription && !isSubscribed()) {
    return <Navigate to="/subscription" replace />
  }

  return children
}
