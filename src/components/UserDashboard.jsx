import { useEffect, useState } from 'react'
import { useLang } from '../context/LangContext.jsx'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import { COUNTRIES, COUNTRY_CURRENCY } from '../data/currency.js'

const FLAG_MAP = {
  Poland: 'PL',
  'United States': 'US',
  'United Kingdom': 'UK',
  Germany: 'DE',
  France: 'FR',
  Spain: 'ES',
  Italy: 'IT',
  Netherlands: 'NL',
  Ukraine: 'UA',
  Russia: 'RU',
  'Czech Republic': 'CZ',
  Slovakia: 'SK',
  Hungary: 'HU',
  Romania: 'RO',
  Other: 'OT',
}

function initialsFromUser(user = {}) {
  const source = String(user?.name || user?.nickname || '?').trim()
  if (!source) return '??'
  const parts = source.split(/\s+/).filter(Boolean)
  if (parts.length >= 2) return `${parts[0][0] || ''}${parts[1][0] || ''}`.toUpperCase()
  return source.slice(0, 2).toUpperCase()
}

function avatarPalette(seed = '') {
  const hues = [8, 22, 38, 156, 196, 218, 262, 286, 336]
  let hash = 0
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) % 100000
  const hue = hues[hash % hues.length]
  return {
    bg: `linear-gradient(135deg, hsl(${hue} 72% 36%), hsl(${(hue + 24) % 360} 78% 48%))`,
    border: `hsl(${hue} 55% 62%)`,
  }
}

function Tab({ label, active, onClick }) {
  return (
    <button
      onClick={onClick}
      className="user-dashboard-tab"
      style={{
        flex: 1,
        minHeight: 42,
        padding: '10px 12px',
        background: active ? 'rgba(255,122,0,0.10)' : 'transparent',
        border: active ? '1px solid rgba(255,122,0,0.32)' : '1px solid transparent',
        borderBottom: 'none',
        color: active ? '#f8fafc' : '#94a3b8',
        fontWeight: active ? 800 : 600,
        fontSize: 12,
        cursor: 'pointer',
        transition: 'all 0.15s',
        letterSpacing: '0.04em',
        whiteSpace: 'nowrap',
        borderRadius: 12,
      }}
    >
      {label}
    </button>
  )
}

function ChangePasswordForm({ compact = false }) {
  const { changePassword, loading } = useAuth()
  const { t } = useLang()
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [status, setStatus] = useState(null)
  const [msg, setMsg] = useState('')

  async function handleSubmit() {
    if (next.length < 8) {
      setStatus('error')
      setMsg(t('dash_pw_min'))
      return
    }
    if (next !== confirm) {
      setStatus('error')
      setMsg(t('dash_pw_mismatch'))
      return
    }
    if (!current) {
      setStatus('error')
      setMsg(t('dash_pw_empty'))
      return
    }

    setStatus(null)
    const res = await changePassword({ currentPassword: current, newPassword: next })
    if (res.ok) {
      setStatus('ok')
      setMsg(t('dash_pw_success'))
      setCurrent('')
      setNext('')
      setConfirm('')
    } else {
      setStatus('error')
      setMsg(t('dash_pw_error'))
    }
  }

  const inp = {
    width: '100%',
    padding: '9px 12px',
    borderRadius: 8,
    border: '1px solid var(--sw-border)',
    background: 'var(--sw-surface-0)',
    color: '#f1f5f9',
    fontSize: 13,
    outline: 'none',
    boxSizing: 'border-box',
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ fontSize: 11, color: '#6b7280', fontWeight: 700, letterSpacing: '0.08em', marginBottom: 2 }}>
        {t('dash_change_pw')}
      </div>

      {[ 
        { label: t('dash_old_pw'), val: current, set: setCurrent },
        { label: t('dash_new_pw'), val: next, set: setNext },
        { label: t('dash_confirm_pw'), val: confirm, set: setConfirm },
      ].map(({ label, val, set }) => (
        <div key={label}>
          <div style={{ fontSize: 11, color: '#9ca3af', marginBottom: 4 }}>{label}</div>
          <input
            type="password"
            value={val}
            onChange={e => {
              set(e.target.value)
              setStatus(null)
            }}
            style={inp}
            onFocus={e => {
              e.target.style.borderColor = '#f97316'
            }}
            onBlur={e => {
              e.target.style.borderColor = 'var(--sw-border)'
            }}
          />
        </div>
      ))}

      {status && (
        <div
          style={{
            padding: '8px 12px',
            borderRadius: 7,
            fontSize: 12,
            background: status === 'ok' ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
            border: `1px solid ${status === 'ok' ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)'}`,
            color: status === 'ok' ? '#22c55e' : '#f87171',
          }}
        >
          {msg}
        </div>
      )}

      <button
        onClick={handleSubmit}
        disabled={loading}
        style={{
          marginTop: 2,
          padding: '9px',
          borderRadius: 8,
          border: 'none',
          background: loading ? '#1e3a5f' : 'linear-gradient(135deg,#f97316,#f97316)',
          color: '#fff',
          fontWeight: 700,
          fontSize: 13,
          cursor: loading ? 'not-allowed' : 'pointer',
        }}
      >
        {loading ? t('dash_saving') : t('dash_save_pw')}
      </button>
    </div>
  )
}

function addMonths(dateLike, months) {
  const d = new Date(dateLike)
  const day = d.getDate()
  d.setDate(1)
  d.setMonth(d.getMonth() + months)
  const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()
  d.setDate(Math.min(day, lastDay))
  return d
}

function SubscriptionPanel({ user, onNavigate, compact = false }) {
  const { cancelSubscription, TIERS } = useAuth()
  const { t } = useLang()
  const [cancelling, setCancelling] = useState(false)
  const [cancelled, setCancelled] = useState(false)

  const onPaid = user.tier === TIERS.PAID
  const onFree = user.tier === TIERS.FREE

  const subscribedAt = user?.subscribedAt ? new Date(user.subscribedAt) : new Date()
  const paidEndDate = onPaid
    ? (user?.subscriptionEnd
      ? new Date(user.subscriptionEnd)
      : addMonths(subscribedAt, user?.plan === 'yearly' ? 12 : 1))
    : null

  const paidTotalDays = onPaid
    ? Math.max(1, Math.ceil((paidEndDate - subscribedAt) / (1000 * 60 * 60 * 24)))
    : 0

  const paidDaysLeft = onPaid
    ? Math.max(0, Math.ceil((paidEndDate - new Date()) / (1000 * 60 * 60 * 24)))
    : 0

  const paidProgress = paidTotalDays > 0
    ? Math.min(100, Math.max(0, (paidDaysLeft / paidTotalDays) * 100))
    : 0

  const tierLabel = {
    [TIERS.FREE]: t('dash_tier_free'),
    [TIERS.PAID]: user.plan === 'yearly' ? t('dash_tier_paid_yearly') : t('dash_tier_paid_monthly'),
  }[user.tier] || t('dash_tier_free')

  const tierColor = {
    [TIERS.FREE]: '#6b7280',
    [TIERS.PAID]: '#22c55e',
  }[user.tier]

  async function handleCancel() {
    if (!cancelling) {
      setCancelling(true)
      return
    }
    await cancelSubscription()
    setCancelled(true)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div
        style={{
          padding: '14px 16px',
          borderRadius: 10,
          background: 'rgba(255,255,255,0.03)',
          border: '1px solid var(--sw-border)',
          display: 'flex',
          flexDirection: compact ? 'column' : 'row',
          alignItems: compact ? 'stretch' : 'center',
          justifyContent: 'space-between',
          gap: compact ? 12 : 0,
        }}
      >
        <div>
          <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 5, fontWeight: 600, letterSpacing: '0.06em' }}>
            {t('dash_current_plan')}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: tierColor, boxShadow: `0 0 6px ${tierColor}` }} />
            <span style={{ fontWeight: 800, fontSize: 15, color: tierColor }}>{tierLabel}</span>
          </div>
        </div>

        {onFree && (
          <button
            onClick={() => onNavigate('/subscription')}
            style={{
              padding: '7px 14px',
              borderRadius: 7,
              border: 'none',
              background: 'linear-gradient(135deg,#f97316,#f97316)',
              color: '#fff',
              fontWeight: 700,
              fontSize: 12,
              cursor: 'pointer',
            }}
          >
            {t('dash_upgrade')}
          </button>
        )}
      </div>

      {onPaid && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
          {[
            { l: t('dash_plan_label'), v: user.plan === 'yearly' ? t('dash_yearly') : t('dash_monthly') },
            { l: t('dash_expires'), v: paidEndDate ? paidEndDate.toLocaleDateString() : t('dash_no_data') },
            { l: 'Days left', v: `${paidDaysLeft}d` },
          ].map(({ l, v }) => (
            <div key={l} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
              <span style={{ color: '#6b7280' }}>{l}</span>
              <span style={{ color: '#9ca3af', fontWeight: 600 }}>{v}</span>
            </div>
          ))}

          <div style={{ marginTop: 6 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#6b7280', marginBottom: 5 }}>
              <span>Billing period</span>
              <span style={{ color: '#22c55e', fontWeight: 700 }}>{paidDaysLeft}/{paidTotalDays}d</span>
            </div>
            <div style={{ height: 6, background: 'var(--sw-border)', borderRadius: 3, overflow: 'hidden' }}>
              <div
                style={{
                  width: `${paidProgress}%`,
                  height: '100%',
                  background: 'linear-gradient(90deg,#16a34a,#22c55e)',
                  borderRadius: 3,
                }}
              />
            </div>
          </div>
        </div>
      )}

      {onFree && (
        <div style={{ padding: '12px 14px', borderRadius: 9, background: 'rgba(249,115,22,0.07)', border: '1px solid rgba(249,115,22,0.2)' }}>
          <div style={{ fontSize: 13, color: '#d1d5db', fontWeight: 700, marginBottom: 5 }}>Free access enabled</div>
          <div style={{ fontSize: 12, color: '#9ca3af', lineHeight: 1.5, marginBottom: 8 }}>The app is currently fully available on the Free plan. Premium monthly and yearly plans remain available for later rollout.</div>
          <button
            onClick={() => onNavigate('/subscription')}
            style={{
              width: '100%',
              padding: '8px',
              borderRadius: 7,
              border: 'none',
              background: 'rgba(249,115,22,0.2)',
              color: '#d1d5db',
              fontWeight: 700,
              fontSize: 12,
              cursor: 'pointer',
            }}
          >
            View plans
          </button>
        </div>
      )}

      {onPaid && !cancelled && (
        <button
          onClick={handleCancel}
          style={{
            width: '100%',
            padding: '8px',
            borderRadius: 7,
            border: `1px solid ${cancelling ? '#ef4444' : 'var(--sw-border)'}`,
            background: cancelling ? 'rgba(239,68,68,0.1)' : 'none',
            color: cancelling ? '#ef4444' : '#6b7280',
            fontSize: 12,
            cursor: 'pointer',
            transition: 'all 0.2s',
          }}
        >
          {cancelling ? t('dash_cancel_confirm_click') : t('sub_cancel')}
        </button>
      )}

      {cancelled && <div style={{ fontSize: 12, color: '#6b7280', textAlign: 'center' }}>{t('dash_cancel_done')}</div>}
    </div>
  )
}

function ProfilePanel({ user, compact = false }) {
  const { t } = useLang()
  const { updateUser } = useAuth()
  const [name, setName] = useState(user.name || '')
  const [nickname, setNickname] = useState(user.nickname || '')
  const [email, setEmail] = useState(user.email || '')
  const [country, setCountry] = useState(user.country || 'Poland')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const cc = COUNTRY_CURRENCY[country] || COUNTRY_CURRENCY.Poland

  async function handleSave() {
    const trimmedName = String(name || '').trim()
    const trimmedNick = String(nickname || '').trim()
    const trimmedEmail = String(email || '').trim()
    if (!trimmedName || !trimmedNick || !trimmedEmail) return
    setSaving(true)
    if (updateUser) {
      const result = await updateUser({
        name: trimmedName,
        nickname: trimmedNick,
        email: trimmedEmail,
        country,
        avatar: null,
      })
      if (!result?.ok) {
        setSaving(false)
        return
      }
    }
    setSaving(false)

    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div className="user-profile-grid" style={{ display: 'grid', gap: 14, alignItems: 'start' }}>
      <div
        className="user-profile-card"
        style={{
          padding: '14px 16px',
          borderRadius: 14,
          background: 'linear-gradient(180deg, rgba(32,33,37,0.92), rgba(22,23,26,0.98))',
          border: '1px solid rgba(255,255,255,0.08)',
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
          boxShadow: '0 12px 28px rgba(0,0,0,0.22)',
        }}
      >
        <div className="profile-avatar-row" style={{ display: 'flex', flexDirection: compact ? 'column' : 'row', alignItems: compact ? 'flex-start' : 'center', gap: 12 }}>
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: '50%',
              background: avatarPalette(`${name}-${nickname}`).bg,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 18,
              fontWeight: 900,
              color: '#fff',
              border: `2px solid ${avatarPalette(`${name}-${nickname}`).border}`,
              flexShrink: 0,
              letterSpacing: '0.02em',
            }}
          >
            {initialsFromUser({ name, nickname })}
          </div>
          <div style={{ minWidth: 0, flex: 1, display: 'flex', flexDirection: 'column', gap: 6, width: compact ? '100%' : 'auto' }}>
            <label style={{ fontSize: 11, color: '#9ca3af', fontWeight: 600 }}>Profile Initials</label>
          </div>
        </div>

        <div>
          <div style={{ fontSize: 11, color: '#6b7280', fontWeight: 600, letterSpacing: '0.06em', marginBottom: 3 }}>NAME</div>
          <input
            value={name}
            onChange={e => { setName(e.target.value); setSaved(false) }}
            style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid var(--sw-border)', background: 'var(--sw-surface-0)', color: '#f1f5f9', fontSize: 13, outline: 'none', boxSizing: 'border-box' }}
          />
        </div>

        <div>
          <div style={{ fontSize: 11, color: '#6b7280', fontWeight: 600, letterSpacing: '0.06em', marginBottom: 3 }}>NICKNAME</div>
          <input
            value={nickname}
            onChange={e => { setNickname(e.target.value); setSaved(false) }}
            style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid var(--sw-border)', background: 'var(--sw-surface-0)', color: '#f1f5f9', fontSize: 13, outline: 'none', boxSizing: 'border-box' }}
          />
        </div>

        <div>
          <div style={{ fontSize: 11, color: '#6b7280', fontWeight: 600, letterSpacing: '0.06em', marginBottom: 3 }}>EMAIL</div>
          <input
            value={email}
            onChange={e => { setEmail(e.target.value); setSaved(false) }}
            style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid var(--sw-border)', background: 'var(--sw-surface-0)', color: '#f1f5f9', fontSize: 13, outline: 'none', boxSizing: 'border-box' }}
          />
        </div>
      </div>

      <div className="user-profile-card" style={{ padding: '14px 16px', borderRadius: 14, background: 'linear-gradient(180deg, rgba(32,33,37,0.92), rgba(22,23,26,0.98))', border: '1px solid rgba(255,255,255,0.08)', boxShadow: '0 12px 28px rgba(0,0,0,0.22)' }}>
        <div style={{ fontSize: 11, color: '#6b7280', fontWeight: 600, letterSpacing: '0.06em', marginBottom: 10 }}>
          {t('dash_country').toUpperCase()}
        </div>

        <select
          value={country}
          onChange={e => {
            setCountry(e.target.value)
            setSaved(false)
          }}
          style={{
            width: '100%',
            padding: '9px 12px',
            borderRadius: 8,
            border: '1px solid var(--sw-border)',
            background: 'var(--sw-surface-0)',
            color: '#f1f5f9',
            fontSize: 13,
            cursor: 'pointer',
            outline: 'none',
            boxSizing: 'border-box',
            marginBottom: 10,
          }}
        >
          {COUNTRIES.map(c => (
            <option key={c} value={c}>{FLAG_MAP[c] || 'OT'} {c}</option>
          ))}
        </select>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderRadius: 7, background: 'rgba(249,115,22,0.07)', border: '1px solid rgba(249,115,22,0.15)', marginBottom: 12 }}>
          <span style={{ fontSize: 12, fontWeight: 800, color: '#e5e7eb' }}>{FLAG_MAP[country] || 'OT'}</span>
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#d1d5db' }}>{cc.currency} ({cc.symbol})</div>
            <div style={{ fontSize: 11, color: '#4b5563' }}>{t('dash_currency_auto')}</div>
          </div>
        </div>

        <button
          onClick={handleSave}
          disabled={saving || !name.trim() || !nickname.trim() || !email.trim()}
          style={{
            width: '100%',
            padding: '9px',
            borderRadius: 8,
            background: saved ? 'rgba(34,197,94,0.15)' : 'linear-gradient(135deg,#f97316,#f97316)',
            color: saved ? '#22c55e' : '#fff',
            fontWeight: 700,
            fontSize: 13,
            cursor: saving || !name.trim() || !nickname.trim() || !email.trim() ? 'not-allowed' : 'pointer',
            transition: 'all 0.2s',
            border: saved ? '1px solid rgba(34,197,94,0.3)' : 'none',
            opacity: saving || !name.trim() || !nickname.trim() || !email.trim() ? 0.6 : 1,
          }}
        >
          {saving ? 'Saving...' : saved ? `OK ${t('dash_saved')}` : t('dash_save')}
        </button>
      </div>
    </div>
  )
}

export default function UserDashboard({ onClose, initialTab = 'profile' }) {
  const navigate = useNavigate()
  const { user, logout } = useAuth()
  const { t } = useLang()
  const [tab, setTab] = useState(initialTab)
  const [compact, setCompact] = useState(() => window.innerWidth <= 640)

  useEffect(() => {
    const onResize = () => setCompact(window.innerWidth <= 640)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  useEffect(() => {
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prevOverflow
    }
  }, [])

  if (!user) return null

  const displayName = user.nickname || user.name || '?'
  const avatarTheme = avatarPalette(`${user?.name || ''}-${user?.nickname || ''}`)

  async function handleLogout() {
    await logout()
    navigate('/login')
  }

  function handleNavigate(path) {
    navigate(path)
    if (onClose) onClose()
  }

  const TABS = [
    { key: 'plan', label: t('dash_plan') },
    { key: 'profile', label: t('dash_profile') },
    { key: 'haslo', label: t('dash_password') },
  ]

  return (
    <div
      className="user-dashboard-overlay"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1000,
        background: 'rgba(0,0,0,0.72)',
        backdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: compact ? 'center' : 'center',
        justifyContent: 'center',
        padding: compact ? '12px' : '24px',
      }}
      onClick={onClose}
    >
      <div
        className="user-dashboard-shell"
        style={{
          background: 'linear-gradient(180deg, rgba(24,25,28,0.98), rgba(12,13,15,0.99))',
          border: '1px solid var(--sw-border)',
          borderRadius: 20,
          width: compact ? '100%' : 'min(680px, calc(100vw - 48px))',
          maxWidth: compact ? 420 : 680,
          maxHeight: compact ? 'min(92vh, 760px)' : 'min(88vh, 880px)',
          minHeight: compact ? 'min(78vh, 680px)' : 'min(640px, 80vh)',
          overflow: 'hidden',
          boxShadow: '0 30px 70px rgba(0,0,0,0.6)',
          animation: 'dashSlideDown 0.18s ease-out',
          display: 'flex',
          flexDirection: 'column',
          position: 'relative',
          isolation: 'isolate',
        }}
        onClick={e => e.stopPropagation()}
      >
        <style>{`@keyframes dashSlideDown { from{opacity:0;transform:translateY(-8px)} to{opacity:1;transform:translateY(0)} }`}</style>

        <div className="user-dashboard-header" style={{ padding: compact ? '14px 14px 12px' : '20px 24px 16px', background: 'rgba(12,13,15,0.98)', borderBottom: '1px solid var(--sw-border)', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: compact ? 'flex-start' : 'center', gap: 12 }}>
            <div
              style={{
                width: 46,
                height: 46,
                borderRadius: '50%',
                background: avatarTheme.bg,
                border: `2px solid ${avatarTheme.border}`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 16,
                fontWeight: 900,
                color: '#fff',
                flexShrink: 0,
                letterSpacing: '0.02em',
              }}
            >
              {initialsFromUser(user)}
            </div>

            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontWeight: 800, fontSize: 15, color: '#f1f5f9', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {user.name}
              </div>
              <div style={{ fontSize: 12, color: '#6b7280', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: 1 }}>
                @{user.nickname} - {user.country ? `${FLAG_MAP[user.country] || 'OT'} ${user.country}` : ''}
              </div>
            </div>

            <button
              onClick={onClose}
              style={{ width: 28, height: 28, borderRadius: '50%', background: 'rgba(255,255,255,0.04)', border: '1px solid var(--sw-border)', color: '#64748b', cursor: 'pointer', fontSize: 16, padding: 0, flexShrink: 0, display: 'grid', placeItems: 'center' }}
            >
              ×
            </button>
          </div>
        </div>

        <div className="user-dashboard-tabs" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8, borderBottom: '1px solid var(--sw-border)', background: 'rgba(12,13,15,0.98)', flexShrink: 0, padding: compact ? '10px 10px 12px' : '12px 16px 14px' }}>
          {TABS.map(tb => (
            <Tab key={tb.key} label={tb.label} active={tab === tb.key} onClick={() => setTab(tb.key)} />
          ))}
        </div>

        <div className="user-dashboard-content" style={{ padding: compact ? '14px' : '20px 24px', flex: 1, minHeight: 0, overflowY: 'auto', overflowX: 'hidden', background: 'linear-gradient(180deg, rgba(20,21,24,0.98), rgba(12,13,15,0.98))' }}>
          {tab === 'plan' && <SubscriptionPanel user={user} onNavigate={handleNavigate} compact={compact} />}
          {tab === 'profile' && <ProfilePanel user={user} compact={compact} />}
          {tab === 'haslo' && <ChangePasswordForm compact={compact} />}
        </div>

        <div className="user-dashboard-footer" style={{ borderTop: '1px solid var(--sw-border)', padding: '8px 0', background: 'linear-gradient(180deg, rgba(14,15,18,0.98), rgba(10,11,13,0.99))', flexShrink: 0 }}>
          <button
            onClick={() => {
              window.location.href = 'mailto:support@obstawiajzglowa.pl'
            }}
            style={{ width: '100%', padding: '12px 20px', background: 'transparent', border: 'none', color: '#9ca3af', fontSize: 13, textAlign: 'left', cursor: 'pointer' }}
            onMouseEnter={e => {
              e.currentTarget.style.background = 'rgba(255,255,255,0.04)'
            }}
            onMouseLeave={e => {
              e.currentTarget.style.background = 'none'
            }}
          >
            {t('dash_support_email')}
          </button>

          <div style={{ height: 1, background: 'var(--sw-border)', margin: '4px 0' }} />

          <button
            onClick={handleLogout}
            style={{ width: '100%', padding: '12px 20px', background: 'transparent', border: 'none', color: '#ef4444', fontSize: 13, textAlign: 'left', cursor: 'pointer' }}
            onMouseEnter={e => {
              e.currentTarget.style.background = 'rgba(239,68,68,0.06)'
            }}
            onMouseLeave={e => {
              e.currentTarget.style.background = 'none'
            }}
          >
            {t('dash_logout')}
          </button>
        </div>
      </div>
    </div>
  )
}


