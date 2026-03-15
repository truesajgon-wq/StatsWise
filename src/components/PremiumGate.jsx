import { useNavigate } from 'react-router-dom'
import { useAuth, TIERS } from '../context/AuthContext.jsx'

export default function PremiumGate({ children, featureName = 'This feature' }) {
  const { user, isSubscribed } = useAuth()
  const navigate = useNavigate()

  if (isSubscribed()) return children ?? null

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      minHeight: 260, gap: 12, padding: 32, textAlign: 'center',
    }}>
      <div style={{ fontSize: 28 }}>🔒</div>
      <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--sw-text)' }}>{featureName}</div>
      <div style={{ fontSize: 13, color: 'var(--sw-muted)', maxWidth: 300 }}>
        This feature is available to Premium subscribers.
      </div>
      <button
        onClick={() => navigate('/subscription')}
        style={{
          marginTop: 8, padding: '10px 24px', borderRadius: 8, border: 'none',
          background: 'var(--sw-accent)', color: '#fff', fontWeight: 800,
          fontSize: 14, cursor: 'pointer',
        }}
      >
        Upgrade to Premium
      </button>
    </div>
  )
}

export function usePremiumGate() {
  const { isSubscribed } = useAuth()
  return { isPremium: isSubscribed() }
}
