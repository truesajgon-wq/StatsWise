import { useNavigate } from 'react-router-dom'

const updatedDate = 'March 10, 2026'

export default function PrivacyPage() {
  const navigate = useNavigate()

  return (
    <div className="theme-page" style={{ color: '#e2e8f0' }}>
      <header className="theme-header legal-page-header" style={{ padding: '14px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
        <button className="theme-button-ghost" onClick={() => navigate('/')} style={{ borderRadius: 8, padding: '7px 12px', cursor: 'pointer', fontSize: 13, fontWeight: 700 }}>
          Back
        </button>
        <div style={{ fontSize: 18, fontWeight: 900, color: '#d1d5db' }}>Privacy Policy</div>
        <div style={{ width: 62 }} />
      </header>

      <main className="legal-page-main" style={{ maxWidth: 920, margin: '0 auto', padding: '18px 16px 28px', lineHeight: 1.7 }}>
        <h1 style={{ margin: '0 0 8px', fontSize: 28, fontWeight: 900, color: '#f8fafc' }}>Privacy Policy</h1>
        <p style={{ margin: '0 0 18px', color: '#94a3b8', fontSize: 13 }}>Last Updated: {updatedDate}</p>

        <section style={{ marginBottom: 14 }}>
          <h2 style={{ margin: '0 0 6px', fontSize: 18, fontWeight: 800, color: '#f1f5f9' }}>1. Introduction</h2>
          <p style={{ margin: 0 }}>
            This Privacy Policy explains what personal data StatsWise collects, how we use it, and what rights you may have.
          </p>
        </section>

        <section style={{ marginBottom: 14 }}>
          <h2 style={{ margin: '0 0 6px', fontSize: 18, fontWeight: 800, color: '#f1f5f9' }}>2. Data We Collect</h2>
          <ul style={{ margin: '0 0 8px 18px' }}>
            <li>Account data such as email address, display name, and nickname</li>
            <li>Authentication events such as sign-in, password reset, and email confirmation</li>
            <li>Billing-related data needed to manage subscriptions and payments</li>
            <li>Technical data such as IP address, device, browser, and usage activity</li>
          </ul>
        </section>

        <section style={{ marginBottom: 14 }}>
          <h2 style={{ margin: '0 0 6px', fontSize: 18, fontWeight: 800, color: '#f1f5f9' }}>3. How We Use Data</h2>
          <ul style={{ margin: '0 0 8px 18px' }}>
            <li>To provide account access, password recovery, and user support</li>
            <li>To secure the platform and prevent fraud or abuse</li>
            <li>To manage subscriptions, billing, and payment verification</li>
            <li>To improve product quality, reliability, and performance</li>
          </ul>
          <p style={{ margin: 0 }}>We do not sell your personal data.</p>
        </section>

        <section style={{ marginBottom: 14 }}>
          <h2 style={{ margin: '0 0 6px', fontSize: 18, fontWeight: 800, color: '#f1f5f9' }}>4. Third-Party Processors</h2>
          <p style={{ margin: '0 0 6px' }}>We rely on third-party providers to operate the service, including:</p>
          <ul style={{ margin: '0 0 8px 18px' }}>
            <li>Supabase for authentication and account storage</li>
            <li>Stripe for subscription billing and payment processing</li>
            <li>Hosting and infrastructure providers used to run the app and backend</li>
          </ul>
        </section>

        <section style={{ marginBottom: 14 }}>
          <h2 style={{ margin: '0 0 6px', fontSize: 18, fontWeight: 800, color: '#f1f5f9' }}>5. Retention and Security</h2>
          <p style={{ margin: '0 0 6px' }}>We retain personal data only as long as needed for service delivery, security, legal compliance, and dispute handling.</p>
          <p style={{ margin: 0 }}>We use reasonable technical and organizational safeguards, but no online system can be guaranteed completely secure.</p>
        </section>

        <section style={{ marginBottom: 14 }}>
          <h2 style={{ margin: '0 0 6px', fontSize: 18, fontWeight: 800, color: '#f1f5f9' }}>6. Your Rights</h2>
          <p style={{ margin: '0 0 6px' }}>Depending on your jurisdiction, you may have the right to access, correct, export, or delete your personal data.</p>
          <p style={{ margin: 0 }}>Requests regarding privacy and personal data should be handled through your support contact and backend data stores.</p>
        </section>

        <section style={{ marginBottom: 14 }}>
          <h2 style={{ margin: '0 0 6px', fontSize: 18, fontWeight: 800, color: '#f1f5f9' }}>7. Children</h2>
          <p style={{ margin: 0 }}>The platform is intended for adults only and must not be used by anyone under the legal age required in their jurisdiction.</p>
        </section>

        <section>
          <h2 style={{ margin: '0 0 6px', fontSize: 18, fontWeight: 800, color: '#f1f5f9' }}>8. Policy Updates</h2>
          <p style={{ margin: 0 }}>We may update this policy from time to time. Continued use of the platform after updates means the revised policy applies.</p>
        </section>
      </main>
    </div>
  )
}
