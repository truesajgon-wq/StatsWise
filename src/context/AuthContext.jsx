import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { cancelBillingSubscription, fetchBillingSubscription, setApiAccessTokenGetter } from '../data/api.js'
import { isSupabaseConfigured, supabase } from '../lib/supabaseClient.js'

const AuthContext = createContext(null)

export const TIERS = {
  FREE: 'free',
  PAID: 'paid',
}

export const PRICING = {
  monthly: 34.99,
  yearly: 314.91,
  yearlyMonthly: 26.24,
}

function normalizeDisplayName(rawUser) {
  const meta = rawUser?.user_metadata || {}
  return (
    meta.name ||
    meta.full_name ||
    [meta.first_name, meta.last_name].filter(Boolean).join(' ').trim() ||
    meta.nickname ||
    rawUser?.email?.split('@')[0] ||
    'User'
  )
}

function normalizeNickname(rawUser) {
  const meta = rawUser?.user_metadata || {}
  return meta.nickname || meta.user_name || rawUser?.email?.split('@')[0] || 'user'
}

function mapSupabaseUser(rawUser, billing = null) {
  if (!rawUser) return null

  const meta = rawUser.user_metadata || {}
  const status = billing?.subscription?.status
  const isPaidSub = status === 'active' || status === 'canceled'
  const trialActive = Boolean(billing?.trial?.active)
  const isPaid = isPaidSub || trialActive

  return {
    id: rawUser.id,
    email: rawUser.email || '',
    name: normalizeDisplayName(rawUser),
    nickname: normalizeNickname(rawUser),
    avatar: meta.avatar_url || meta.picture || null,
    country: meta.country || billing?.country || null,
    provider: rawUser.app_metadata?.provider || 'email',
    createdAt: rawUser.created_at || null,
    tier: isPaid ? TIERS.PAID : TIERS.FREE,
    plan: billing?.plan === 'premium_yearly' ? 'yearly' : billing?.plan === 'premium_monthly' ? 'monthly' : null,
    subscriptionEnd: billing?.subscription?.current_period_end || null,
    billingStatus: status || 'inactive',
    trialActive,
    trialDaysLeft: billing?.trial?.daysLeft ?? 0,
    trialUsed: Boolean(billing?.trial?.used),
    trialEndsAt: billing?.trial?.endsAt || null,
  }
}

async function currentAccessToken() {
  if (!supabase) return null
  const { data } = await supabase.auth.getSession()
  return data?.session?.access_token || null
}

function authRedirectMode() {
  if (typeof window === 'undefined') return ''
  return new URL(window.location.href).searchParams.get('mode') || ''
}

function cleanupAuthRedirectUrl() {
  if (typeof window === 'undefined') return
  const url = new URL(window.location.href)
  url.hash = ''
  url.searchParams.delete('code')
  window.history.replaceState({}, document.title, `${url.pathname}${url.search}${url.hash}`)
}

async function establishSessionFromUrl() {
  if (!supabase || typeof window === 'undefined') return null

  const url = new URL(window.location.href)
  const hashParams = new URLSearchParams(url.hash.startsWith('#') ? url.hash.slice(1) : url.hash)
  const accessToken = hashParams.get('access_token')
  const refreshToken = hashParams.get('refresh_token')
  const code = url.searchParams.get('code')

  if (accessToken && refreshToken) {
    const { data, error } = await supabase.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    })
    if (error) throw error
    cleanupAuthRedirectUrl()
    return data?.session || null
  }

  if (code) {
    const { data, error } = await supabase.auth.exchangeCodeForSession(code)
    if (error) throw error
    cleanupAuthRedirectUrl()
    return data?.session || null
  }

  return null
}

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(false)
  const [initializing, setInitializing] = useState(true)
  const [error, setError] = useState(null)
  const [recoverySessionReady, setRecoverySessionReady] = useState(false)

  useEffect(() => {
    setApiAccessTokenGetter(currentAccessToken)
    return () => setApiAccessTokenGetter(null)
  }, [])

  useEffect(() => {
    let cancelled = false

    if (!supabase) {
      setInitializing(false)
      return undefined
    }

    async function bootstrap() {
      // Handle auth redirect (OAuth callback / password reset link) first,
      // so the new session is stored before the listener is attached.
      try {
        const urlSession = await establishSessionFromUrl()
        if (cancelled) return
        if (urlSession) {
          setSession(urlSession)
          if (authRedirectMode() === 'reset') setRecoverySessionReady(true)
        }
      } catch (sessionUrlError) {
        if (!cancelled) setError(sessionUrlError.message || 'Could not restore password reset session.')
      }
    }

    // Set up the auth state change listener FIRST so it is the single source
    // of session truth. It fires with INITIAL_SESSION on mount (which may
    // trigger at most one token refresh internally). Calling getSession()
    // separately in addition would risk a double-refresh which Supabase's
    // "detect compromised tokens" protection treats as a replay attack and
    // revokes the session → SIGNED_OUT on every page reload.
    const { data: listener } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (cancelled) return
      setSession(nextSession || null)
      if (event === 'INITIAL_SESSION') {
        setInitializing(false)
        setRecoverySessionReady(Boolean(nextSession && authRedirectMode() === 'reset'))
        return
      }
      if (event === 'PASSWORD_RECOVERY') {
        setRecoverySessionReady(Boolean(nextSession))
        return
      }
      if (!nextSession) {
        setRecoverySessionReady(false)
        return
      }
      setRecoverySessionReady(authRedirectMode() === 'reset')
    })

    bootstrap()

    return () => {
      cancelled = true
      listener?.subscription?.unsubscribe()
    }
  }, [])

  useEffect(() => {
    let cancelled = false

    async function syncUser() {
      if (!session?.user) {
        setUser(null)
        return
      }

      try {
        const billing = await fetchBillingSubscription({
          country: session.user.user_metadata?.country,
          locale: typeof navigator !== 'undefined' ? navigator.language : 'en-US',
        })
        if (cancelled) return
        setUser(mapSupabaseUser(session.user, billing))
      } catch {
        if (cancelled) return
        setUser(mapSupabaseUser(session.user, null))
      }
    }

    syncUser()
    return () => {
      cancelled = true
    }
  }, [session])

  function clearError() {
    setError(null)
  }

  function ensureConfigured() {
    if (supabase) return true
    setError('Authentication is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.')
    return false
  }

  function isSubscribed() {
    return Boolean(user && user.tier === TIERS.PAID)
  }

  async function register({ name, nickname, email, password }) {
    if (!ensureConfigured()) return { ok: false }
    setLoading(true)
    setError(null)
    try {
      const { data, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            name: String(name || '').trim(),
            nickname: String(nickname || '').trim(),
          },
        },
      })
      if (signUpError) throw signUpError
      return {
        ok: true,
        requiresEmailConfirmation: !data?.session,
        message: data?.session ? null : 'Account created. Check your email to confirm your account.',
      }
    } catch (err) {
      setError(err.message || 'Registration failed')
      return { ok: false, error: err.message }
    } finally {
      setLoading(false)
    }
  }

  async function loginEmail({ email, password }) {
    if (!ensureConfigured()) return { ok: false }
    setLoading(true)
    setError(null)
    try {
      const { error: signInError } = await supabase.auth.signInWithPassword({ email, password })
      if (signInError) throw signInError
      return { ok: true }
    } catch (err) {
      setError(err.message || 'Login failed')
      return { ok: false, error: err.message }
    } finally {
      setLoading(false)
    }
  }

  async function subscribe() {
    return { ok: false, error: 'Subscriptions are handled through the billing page.' }
  }

  async function cancelSubscription() {
    if (!ensureConfigured()) return { ok: false }
    setLoading(true)
    setError(null)
    try {
      await cancelBillingSubscription()
      if (session?.user) {
        const billing = await fetchBillingSubscription({
          country: session.user.user_metadata?.country,
          locale: typeof navigator !== 'undefined' ? navigator.language : 'en-US',
        })
        setUser(mapSupabaseUser(session.user, billing))
      }
      return { ok: true }
    } catch (err) {
      setError(err.message || 'Subscription cancellation failed')
      return { ok: false, error: err.message }
    } finally {
      setLoading(false)
    }
  }

  async function updateUser(fields) {
    if (!ensureConfigured()) return { ok: false }
    const currentUser = session?.user
    if (!currentUser) return { ok: false, error: 'Not authenticated.' }

    setLoading(true)
    setError(null)
    try {
      const nextEmail = String(fields?.email || currentUser.email || '').trim()
      const nextMetadata = {
        ...currentUser.user_metadata,
        name: fields?.name ?? currentUser.user_metadata?.name ?? normalizeDisplayName(currentUser),
        nickname: fields?.nickname ?? currentUser.user_metadata?.nickname ?? normalizeNickname(currentUser),
        country: fields?.country ?? currentUser.user_metadata?.country ?? null,
      }

      const payload = { data: nextMetadata }
      if (nextEmail && nextEmail !== currentUser.email) payload.email = nextEmail

      const { data, error: updateError } = await supabase.auth.updateUser(payload)
      if (updateError) throw updateError
      setUser(prev => mapSupabaseUser(data.user || currentUser, {
        plan: prev?.plan === 'yearly' ? 'premium_yearly' : prev?.plan === 'monthly' ? 'premium_monthly' : null,
        country: nextMetadata.country,
        subscription: {
          status: prev?.billingStatus || 'inactive',
          current_period_end: prev?.subscriptionEnd || null,
        },
      }))
      return { ok: true }
    } catch (err) {
      setError(err.message || 'Profile update failed')
      return { ok: false, error: err.message }
    } finally {
      setLoading(false)
    }
  }

  async function logout() {
    if (!supabase) {
      setUser(null)
      setError(null)
      return { ok: true }
    }
    await supabase.auth.signOut()
    setUser(null)
    setError(null)
    return { ok: true }
  }

  async function resetPassword({ email } = {}) {
    if (!ensureConfigured()) return { ok: false }
    const targetEmail = String(email || user?.email || '').trim()
    if (!targetEmail) return { ok: false, error: 'Email is required.' }

    setLoading(true)
    setError(null)
    try {
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(targetEmail, {
        redirectTo: `${window.location.origin}/login?mode=reset`,
      })
      if (resetError) throw resetError
      return { ok: true }
    } catch (err) {
      setError(err.message || 'Password reset failed')
      return { ok: false, error: err.message }
    } finally {
      setLoading(false)
    }
  }

  async function changePassword({ currentPassword, newPassword }) {
    if (!ensureConfigured()) return { ok: false }
    if (user?.provider !== 'email') {
      return { ok: false, error: 'Password changes are only available for email accounts.' }
    }

    setLoading(true)
    setError(null)
    try {
      const { error: reauthError } = await supabase.auth.signInWithPassword({
        email: user.email,
        password: currentPassword,
      })
      if (reauthError) throw reauthError

      const { error: updateError } = await supabase.auth.updateUser({ password: newPassword })
      if (updateError) throw updateError
      return { ok: true }
    } catch (err) {
      setError(err.message || 'Password change failed')
      return { ok: false, error: err.message }
    } finally {
      setLoading(false)
    }
  }

  async function completePasswordReset({ newPassword }) {
    if (!ensureConfigured()) return { ok: false }
    if (!newPassword || String(newPassword).length < 8) {
      return { ok: false, error: 'Password must be at least 8 characters.' }
    }

    setLoading(true)
    setError(null)
    try {
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession()
      if (sessionError) throw sessionError
      if (!sessionData?.session) {
        throw new Error('Reset link is invalid or expired. Request a new password reset email.')
      }
      const { error: updateError } = await supabase.auth.updateUser({ password: newPassword })
      if (updateError) throw updateError
      setRecoverySessionReady(false)
      return { ok: true }
    } catch (err) {
      setError(err.message || 'Password reset failed')
      return { ok: false, error: err.message }
    } finally {
      setLoading(false)
    }
  }

  const value = useMemo(() => ({
    user,
    session,
    loading,
    initializing,
    error,
    isSubscribed,
    register,
    loginEmail,
    subscribe,
    cancelSubscription,
    logout,
    resetPassword,
    changePassword,
    completePasswordReset,
    recoverySessionReady,
    updateUser,
    clearError,
    TIERS,
    PRICING,
    isSupabaseConfigured,
  }), [user, session, loading, initializing, error, recoverySessionReady])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}
