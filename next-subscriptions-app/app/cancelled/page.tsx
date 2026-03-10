import Link from 'next/link'

export default function CancelledPage() {
  return (
    <main style={{ maxWidth: 720, margin: '40px auto', padding: 16 }}>
      <h1>Checkout cancelled</h1>
      <p>No charge was made.</p>
      <Link href="/billing">Back to billing</Link>
    </main>
  )
}
