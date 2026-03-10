'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/browser'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [msg, setMsg] = useState('')
  const [loading, setLoading] = useState(false)

  async function signIn() {
    setLoading(true)
    setMsg('')
    try {
      const supabase = createClient()
      const origin = window.location.origin
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: {
          emailRedirectTo: `${origin}/billing`,
        },
      })
      if (error) throw error
      setMsg('Magic link sent. Check your email.')
    } catch (e: any) {
      setMsg(e.message || 'Could not send magic link')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main style={{ maxWidth: 480, margin: '40px auto', padding: 16 }}>
      <h1>Login</h1>
      <p>Use email magic link (Supabase Auth)</p>
      <input
        type="email"
        value={email}
        onChange={e => setEmail(e.target.value)}
        placeholder="you@example.com"
        style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid #334155', background: '#0f172a', color: '#e2e8f0' }}
      />
      <button onClick={signIn} disabled={loading || !email} style={{ marginTop: 10 }}>
        {loading ? 'Sending...' : 'Send magic link'}
      </button>
      {msg && <p>{msg}</p>}
    </main>
  )
}
