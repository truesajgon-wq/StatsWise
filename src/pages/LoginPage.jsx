import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import StatsWiseWordmark from '../components/StatsWiseWordmark.jsx'

function validateEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

function validatePassword(password) {
  return password.length >= 8
}
function Field({ label, type = 'text', value, onChange, error, placeholder, autoComplete }) {
  const [show, setShow] = useState(false)
  const isPassword = type === 'password'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <label style={{ fontSize: 12, fontWeight: 700, color: '#9ca3af', letterSpacing: '0.04em' }}>{label}</label>
      <div style={{ position: 'relative' }}>
        <input
          type={isPassword && show ? 'text' : type}
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          autoComplete={autoComplete}
          className="theme-input"
          style={{ width: '100%', padding: isPassword ? '10px 40px 10px 12px' : '10px 12px', borderRadius: 8, border: `1px solid ${error ? '#ef4444' : 'var(--sw-border)'}`, color: '#f8fafc', fontSize: 14, outline: 'none', boxSizing: 'border-box' }}
        />
        {isPassword && (
          <button type="button" onClick={() => setShow(v => !v)} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', border: 'none', background: 'none', color: '#6b7280', cursor: 'pointer', fontSize: 14 }}>
            {show ? 'Hide' : 'Show'}
          </button>
        )}
      </div>
      {error && <div style={{ fontSize: 11, color: '#ef4444' }}>{error}</div>}
    </div>
  )
}

function SubmitButton({ loading, label }) {
  return (
    <button type="submit" disabled={loading} className="theme-button-primary" style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: 12, borderRadius: 8, fontWeight: 800, whiteSpace: 'nowrap', cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.7 : 1 }}>
      {loading ? 'Loading...' : label}
    </button>
  )
}

function PasswordStrength({ password }) {
  const checks = [
    { label: '8+ chars', ok: password.length >= 8 },
    { label: 'Uppercase', ok: /[A-Z]/.test(password) },
    { label: 'Number', ok: /\d/.test(password) },
    { label: 'Special', ok: /[^A-Za-z0-9]/.test(password) },
  ]
  const score = checks.filter(c => c.ok).length
  const labels = ['Weak', 'Fair', 'Good', 'Strong']
  const colors = ['#ef4444', '#f59e0b', '#eab308', '#22c55e']

  return (
    <div>
      <div style={{ display: 'flex', gap: 4, marginBottom: 6 }}>
        {[0, 1, 2, 3].map(i => <div key={i} style={{ height: 4, flex: 1, borderRadius: 2, background: i < score ? colors[score - 1] : 'var(--sw-border)' }} />)}
      </div>
      <div style={{ fontSize: 11, color: score ? colors[score - 1] : '#6b7280' }}>{score ? labels[score - 1] : 'Too short'}</div>
    </div>
  )
}

export default function LoginPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { loginEmail, register, resetPassword, completePasswordReset, loading, error, clearError, isSupabaseConfigured, recoverySessionReady, initializing } = useAuth()

  const initialMode = useMemo(() => {
    const queryMode = searchParams.get('mode')
    if (queryMode === 'register') return 'register'
    if (queryMode === 'reset') return 'reset'
    return 'login'
  }, [searchParams])
  const [mode, setMode] = useState(initialMode)
  const [loginForm, setLoginForm] = useState({ email: '', password: '' })
  const [regForm, setRegForm] = useState({ name: '', nickname: '', email: '', password: '', confirmPassword: '' })
  const [resetForm, setResetForm] = useState({ password: '', confirmPassword: '' })
  const [loginErrors, setLoginErrors] = useState({})
  const [regErrors, setRegErrors] = useState({})
  const [resetErrors, setResetErrors] = useState({})
  const [notice, setNotice] = useState('')
  const [recoveryEmail, setRecoveryEmail] = useState('')
  const [recoveryError, setRecoveryError] = useState('')

  useEffect(() => {
    setMode(initialMode)
  }, [initialMode])

  function switchMode(next) {
    setMode(next)
    clearError()
    setNotice('')
    setLoginErrors({})
    setRegErrors({})
    setResetErrors({})
    setRecoveryError('')
  }

  function validateLogin() {
    const errs = {}
    if (!loginForm.email) errs.email = 'Email is required'
    else if (!validateEmail(loginForm.email)) errs.email = 'Invalid email format'
    if (!loginForm.password) errs.password = 'Password is required'
    setLoginErrors(errs)
    return Object.keys(errs).length === 0
  }

  function validateRegister() {
    const errs = {}
    if (!regForm.name.trim()) errs.name = 'First name is required'
    if (!regForm.nickname.trim()) errs.nickname = 'Nickname is required'
    if (!regForm.email) errs.email = 'Email is required'
    else if (!validateEmail(regForm.email)) errs.email = 'Invalid email format'
    if (!regForm.password) errs.password = 'Password is required'
    else if (!validatePassword(regForm.password)) errs.password = 'Password must be at least 8 characters'
    if (regForm.confirmPassword !== regForm.password) errs.confirmPassword = 'Passwords do not match'
    setRegErrors(errs)
    return Object.keys(errs).length === 0
  }

  function validateReset() {
    const errs = {}
    if (!resetForm.password) errs.password = 'Password is required'
    else if (!validatePassword(resetForm.password)) errs.password = 'Password must be at least 8 characters'
    if (resetForm.confirmPassword !== resetForm.password) errs.confirmPassword = 'Passwords do not match'
    setResetErrors(errs)
    return Object.keys(errs).length === 0
  }

  async function handleLogin(e) {
    e.preventDefault()
    clearError()
    setNotice('')
    if (!validateLogin()) return
    const result = await loginEmail(loginForm)
    if (result.ok) navigate('/')
  }

  async function handleRegister(e) {
    e.preventDefault()
    clearError()
    setNotice('')
    if (!validateRegister()) return
    const result = await register(regForm)
    if (result.ok && result.requiresEmailConfirmation) {
      switchMode('login')
      setLoginForm(v => ({ ...v, email: regForm.email }))
      setNotice(result.message || 'Account created. Check your email to confirm your account.')
      return
    }
    if (result.ok) navigate('/')
  }

  async function handleRecovery(e) {
    e.preventDefault()
    clearError()
    setNotice('')
    if (!recoveryEmail) {
      setRecoveryError('Email is required')
      return
    }
    if (!validateEmail(recoveryEmail)) {
      setRecoveryError('Invalid email format')
      return
    }
    setRecoveryError('')
    const result = await resetPassword({ email: recoveryEmail })
    if (result.ok) {
      setNotice('Password recovery email sent. Check your inbox and spam folder.')
      setMode('login')
    }
  }

  async function handleResetSubmit(e) {
    e.preventDefault()
    clearError()
    setNotice('')
    if (!validateReset()) return
    const result = await completePasswordReset({ newPassword: resetForm.password })
    if (result.ok) {
      setNotice('Password updated. You can now log in with your new password.')
      setResetForm({ password: '', confirmPassword: '' })
      setMode('login')
    }
  }

  return (
    <div className="login-page theme-page" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div className="login-shell" style={{ width: '100%', maxWidth: 460 }}>
      <div style={{ textAlign: 'center', marginBottom: 26 }}>
          <button
            type="button"
            onClick={() => navigate('/')}
            aria-label="Go to home page"
            style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
          >
            <StatsWiseWordmark color="#d1d5db" />
          </button>
          <div style={{ color: 'var(--sw-muted)', fontSize: 13, marginTop: 4 }}>Football stats for smarter predictions</div>
        </div>

        <div className="login-card theme-card" style={{ overflow: 'hidden', boxShadow: '0 18px 40px rgba(0,0,0,0.28)' }}>
          <div style={{ display: 'grid', gridTemplateColumns: (mode === 'reset' || mode === 'recover') ? '1fr' : '1fr 1fr', borderBottom: '1px solid var(--sw-border)' }}>
            {(mode === 'reset' || mode === 'recover') ? (
              <div style={{ padding: 14, color: '#d1d5db', borderBottom: '2px solid var(--sw-accent)', fontWeight: 700, textAlign: 'center' }}>{mode === 'recover' ? 'Recover Password' : 'Reset Password'}</div>
            ) : (
              <>
                <button onClick={() => switchMode('login')} style={{ padding: 14, border: 'none', background: 'none', color: mode === 'login' ? '#d1d5db' : 'var(--sw-muted)', borderBottom: mode === 'login' ? '2px solid var(--sw-accent)' : '2px solid transparent', fontWeight: 700, cursor: 'pointer' }}>Login</button>
                <button onClick={() => switchMode('register')} style={{ padding: 14, border: 'none', background: 'none', color: mode === 'register' ? '#d1d5db' : 'var(--sw-muted)', borderBottom: mode === 'register' ? '2px solid var(--sw-accent)' : '2px solid transparent', fontWeight: 700, cursor: 'pointer' }}>Register</button>
              </>
            )}
          </div>

          <div style={{ padding: 24 }}>
            {!isSupabaseConfigured && (
              <div style={{ marginBottom: 12, padding: '8px 10px', borderRadius: 8, border: '1px solid rgba(245,158,11,0.35)', background: 'rgba(245,158,11,0.08)', color: '#fcd34d', fontSize: 13 }}>
                Auth is not configured. Add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
              </div>
            )}
            {notice && <div style={{ marginBottom: 12, padding: '8px 10px', borderRadius: 8, border: '1px solid rgba(34,197,94,0.35)', background: 'rgba(34,197,94,0.1)', color: '#86efac', fontSize: 13 }}>{notice}</div>}
            {error && <div style={{ marginBottom: 12, padding: '8px 10px', borderRadius: 8, border: '1px solid rgba(239,68,68,0.35)', background: 'rgba(239,68,68,0.1)', color: '#fca5a5', fontSize: 13 }}>{error}</div>}

            {mode === 'login' && (
              <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <Field label="EMAIL" type="email" value={loginForm.email} onChange={e => setLoginForm(v => ({ ...v, email: e.target.value }))} error={loginErrors.email} placeholder="john@example.com" autoComplete="email" />
                <Field label="PASSWORD" type="password" value={loginForm.password} onChange={e => setLoginForm(v => ({ ...v, password: e.target.value }))} error={loginErrors.password} placeholder="Your password" autoComplete="current-password" />
                <button
                  type="button"
                  onClick={() => {
                    setMode('recover')
                    setRecoveryEmail(loginForm.email)
                    setRecoveryError('')
                    clearError()
                    setNotice('')
                  }}
                  style={{ alignSelf: 'flex-end', marginTop: -4, border: 'none', background: 'none', color: '#94a3b8', fontSize: 12, cursor: 'pointer', padding: 0 }}
                >
                  Forgot password?
                </button>
                <SubmitButton loading={loading} label="Login" />
                <button type="button" onClick={() => switchMode('register')} className="theme-button-secondary" style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: 12, borderRadius: 8, fontWeight: 800, cursor: 'pointer', whiteSpace: 'nowrap' }}>Signup</button>
              </form>
            )}

            {mode === 'register' && (
              <form onSubmit={handleRegister} className="register-form" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div className="register-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <Field label="FIRST NAME" value={regForm.name} onChange={e => setRegForm(v => ({ ...v, name: e.target.value }))} error={regErrors.name} placeholder="John" autoComplete="given-name" />
                  <Field label="NICKNAME" value={regForm.nickname} onChange={e => setRegForm(v => ({ ...v, nickname: e.target.value }))} error={regErrors.nickname} placeholder="janko" autoComplete="username" />
                </div>
                <Field label="EMAIL" type="email" value={regForm.email} onChange={e => setRegForm(v => ({ ...v, email: e.target.value }))} error={regErrors.email} placeholder="john@example.com" autoComplete="email" />
                <Field label="PASSWORD" type="password" value={regForm.password} onChange={e => setRegForm(v => ({ ...v, password: e.target.value }))} error={regErrors.password} placeholder="Strong password" autoComplete="new-password" />
                <Field label="CONFIRM PASSWORD" type="password" value={regForm.confirmPassword} onChange={e => setRegForm(v => ({ ...v, confirmPassword: e.target.value }))} error={regErrors.confirmPassword} placeholder="Repeat password" autoComplete="new-password" />
                {regForm.password && <PasswordStrength password={regForm.password} />}
                <div style={{ fontSize: 11, color: 'var(--sw-muted)' }}>
                  By creating an account, you accept{' '}
                  <Link to="/terms" style={{ color: '#cbd5e1' }}>Terms</Link>{' '}
                  and{' '}
                  <Link to="/privacy" style={{ color: '#cbd5e1' }}>Privacy Policy</Link>.
                </div>
                <SubmitButton loading={loading} label="Create account" />
              </form>
            )}

            {mode === 'reset' && (
              <form onSubmit={handleResetSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div style={{ fontSize: 12, color: '#94a3b8', lineHeight: 1.5 }}>
                  Enter your new password below. This page must be opened from a valid password recovery email.
                </div>
                {initializing ? (
                  <div style={{ fontSize: 12, color: '#94a3b8' }}>Checking your recovery session...</div>
                ) : recoverySessionReady ? (
                  <>
                    <Field label="NEW PASSWORD" type="password" value={resetForm.password} onChange={e => setResetForm(v => ({ ...v, password: e.target.value }))} error={resetErrors.password} placeholder="New password" autoComplete="new-password" />
                    <Field label="CONFIRM PASSWORD" type="password" value={resetForm.confirmPassword} onChange={e => setResetForm(v => ({ ...v, confirmPassword: e.target.value }))} error={resetErrors.confirmPassword} placeholder="Repeat new password" autoComplete="new-password" />
                    {resetForm.password && <PasswordStrength password={resetForm.password} />}
                    <SubmitButton loading={loading} label="Save new password" />
                  </>
                ) : (
                  <div style={{ padding: '10px 12px', borderRadius: 8, border: '1px solid rgba(245,158,11,0.35)', background: 'rgba(245,158,11,0.08)', color: '#fcd34d', fontSize: 13 }}>
                    This reset link is missing or expired. Request a new password recovery email and use the latest link.
                  </div>
                )}
                <button type="button" onClick={() => switchMode(recoverySessionReady ? 'login' : 'recover')} className="theme-button-ghost" style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: 12, borderRadius: 8, fontWeight: 800, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                  {recoverySessionReady ? 'Back to login' : 'Request new reset link'}
                </button>
              </form>
            )}

            {mode === 'recover' && (
              <form onSubmit={handleRecovery} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div style={{ fontSize: 12, color: '#94a3b8', lineHeight: 1.5 }}>
                  Enter your email address and we will send you a secure password recovery link.
                </div>
                <Field
                  label="RECOVERY EMAIL"
                  type="email"
                  value={recoveryEmail}
                  onChange={e => setRecoveryEmail(e.target.value)}
                  error={recoveryError}
                  placeholder="john@example.com"
                  autoComplete="email"
                />
                <SubmitButton loading={loading} label="Send reset link" />
                <button type="button" onClick={() => switchMode('login')} className="theme-button-ghost" style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: 12, borderRadius: 8, fontWeight: 800, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                  Back to login
                </button>
              </form>
            )}
          </div>
        </div>

        <div style={{ textAlign: 'center', marginTop: 16, color: '#64748b', fontSize: 12 }}>(c) 2026 StatsWise | Gamble responsibly 18+</div>
      </div>
    </div>
  )
}


