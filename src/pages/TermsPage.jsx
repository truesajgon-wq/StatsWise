import { useNavigate } from 'react-router-dom'

const updatedDate = 'March 10, 2026'

export default function TermsPage() {
  const navigate = useNavigate()

  return (
    <div className="theme-page" style={{ color: '#e2e8f0' }}>
      <header className="theme-header legal-page-header" style={{ padding: '14px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
        <button className="theme-button-ghost" onClick={() => navigate('/')} style={{ borderRadius: 8, padding: '7px 12px', cursor: 'pointer', fontSize: 13, fontWeight: 700 }}>
          Back
        </button>
        <div style={{ fontSize: 18, fontWeight: 900, color: '#d1d5db' }}>Terms &amp; Conditions</div>
        <div style={{ width: 62 }} />
      </header>

      <main className="legal-page-main" style={{ maxWidth: 920, margin: '0 auto', padding: '18px 16px 28px', lineHeight: 1.7 }}>
        <h1 style={{ margin: '0 0 8px', fontSize: 28, fontWeight: 900, color: '#f8fafc' }}>Terms &amp; Conditions</h1>
        <p style={{ margin: '0 0 18px', color: '#94a3b8', fontSize: 13 }}>Last Updated: {updatedDate}</p>

        <section style={{ marginBottom: 14 }}>
          <h2 style={{ margin: '0 0 6px', fontSize: 18, fontWeight: 800, color: '#f1f5f9' }}>1. Introduction</h2>
          <p style={{ margin: 0 }}>
            By accessing or using StatsWise, including the website, application, and related services, you agree to these Terms.
            If you do not agree, do not use the platform. You must be at least 18 years old, or the legal age in your jurisdiction, to use the service.
          </p>
        </section>

        <section style={{ marginBottom: 14 }}>
          <h2 style={{ margin: '0 0 6px', fontSize: 18, fontWeight: 800, color: '#f1f5f9' }}>2. Service Nature</h2>
          <p style={{ margin: '0 0 6px' }}>StatsWise provides statistical analysis, match insights, and informational betting-related content.</p>
          <p style={{ margin: '0 0 6px' }}>StatsWise is not a bookmaker, does not accept bets, and does not guarantee any outcome or profit.</p>
          <p style={{ margin: 0 }}>All use of the platform and any betting decisions made from it are at your own risk.</p>
        </section>

        <section style={{ marginBottom: 14 }}>
          <h2 style={{ margin: '0 0 6px', fontSize: 18, fontWeight: 800, color: '#f1f5f9' }}>3. No Advice</h2>
          <p style={{ margin: 0 }}>
            Nothing on the platform is financial advice, investment advice, or gambling advice. Content is provided for informational and entertainment purposes only.
          </p>
        </section>

        <section style={{ marginBottom: 14 }}>
          <h2 style={{ margin: '0 0 6px', fontSize: 18, fontWeight: 800, color: '#f1f5f9' }}>4. User Responsibilities</h2>
          <ul style={{ margin: '0 0 8px 18px' }}>
            <li>Comply with all applicable local laws</li>
            <li>Do not use the service where gambling-related content is restricted or illegal</li>
            <li>Do not scrape, abuse, reverse-engineer, or disrupt the platform</li>
            <li>Do not copy, resell, or redistribute proprietary content without permission</li>
          </ul>
        </section>

        <section style={{ marginBottom: 14 }}>
          <h2 style={{ margin: '0 0 6px', fontSize: 18, fontWeight: 800, color: '#f1f5f9' }}>5. Intellectual Property</h2>
          <p style={{ margin: 0 }}>
            Unless stated otherwise, the platform, branding, interface, models, copy, and related materials are owned by StatsWise and may not be reused without permission.
          </p>
        </section>

        <section style={{ marginBottom: 14 }}>
          <h2 style={{ margin: '0 0 6px', fontSize: 18, fontWeight: 800, color: '#f1f5f9' }}>6. Liability Limits</h2>
          <p style={{ margin: 0 }}>
            To the fullest extent permitted by law, StatsWise is not liable for betting losses, financial losses, indirect damages, service interruptions, or inaccuracies in third-party data feeds.
          </p>
        </section>

        <section style={{ marginBottom: 14 }}>
          <h2 style={{ margin: '0 0 6px', fontSize: 18, fontWeight: 800, color: '#f1f5f9' }}>7. Third-Party Services</h2>
          <p style={{ margin: 0 }}>
            The platform may link to or depend on third-party services, including payment processors and data providers. Their terms and policies apply separately.
          </p>
        </section>

        <section style={{ marginBottom: 14 }}>
          <h2 style={{ margin: '0 0 6px', fontSize: 18, fontWeight: 800, color: '#f1f5f9' }}>8. Changes</h2>
          <p style={{ margin: 0 }}>We may update these Terms from time to time. Continued use after updates means the revised Terms apply.</p>
        </section>

        <section>
          <h2 style={{ margin: '0 0 6px', fontSize: 18, fontWeight: 800, color: '#f1f5f9' }}>9. Governing Law</h2>
          <p style={{ margin: 0 }}>These Terms are governed by the laws of Poland unless mandatory local law requires otherwise.</p>
        </section>
      </main>
    </div>
  )
}
