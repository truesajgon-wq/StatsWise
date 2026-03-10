import Link from 'next/link'

export default function SuccessPage() {
  return (
    <main style={{ maxWidth: 720, margin: '40px auto', padding: 16 }}>
      <h1>Payment successful</h1>
      <p>Your subscription will be finalized via webhook in a few seconds.</p>
      <Link href="/billing">Back to billing</Link>
    </main>
  )
}
