import Link from 'next/link'

export default function HomePage() {
  return (
    <main style={{ maxWidth: 880, margin: '40px auto', padding: 16 }}>
      <h1>Subscriptions</h1>
      <p><Link href="/login" style={{ color: '#60a5fa' }}>Login</Link></p>
      <p><Link href="/billing" style={{ color: '#60a5fa' }}>Billing</Link></p>
    </main>
  )
}
