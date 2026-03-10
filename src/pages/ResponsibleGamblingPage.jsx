import { useNavigate } from 'react-router-dom'

export default function ResponsibleGamblingPage() {
  const navigate = useNavigate()

  return (
    <div className="theme-page" style={{ color: '#e2e8f0' }}>
      <header className="theme-header" style={{ padding: '14px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
        <button className="theme-button-ghost" onClick={() => navigate('/')} style={{ borderRadius: 8, padding: '7px 12px', cursor: 'pointer', fontSize: 13, fontWeight: 700 }}>
          Back
        </button>
        <div style={{ fontSize: 18, fontWeight: 900, color: '#d1d5db' }}>Responsible Gambling</div>
        <div style={{ width: 62 }} />
      </header>

      <main style={{ maxWidth: 920, margin: '0 auto', padding: '18px 16px 28px', lineHeight: 1.7 }}>
        <h1 style={{ margin: '0 0 8px', fontSize: 28, fontWeight: 900, color: '#f8fafc' }}>Responsible Gambling</h1>
        <p style={{ margin: '0 0 18px', color: '#94a3b8', fontSize: 13 }}>
          StatsWise provides information and analysis. It does not remove the risk of gambling losses.
        </p>

        <section style={{ marginBottom: 14 }}>
          <h2 style={{ margin: '0 0 6px', fontSize: 18, fontWeight: 800, color: '#f1f5f9' }}>Core Principles</h2>
          <ul style={{ margin: '0 0 8px 18px' }}>
            <li>Only spend money you can afford to lose</li>
            <li>Set time and deposit limits before you start</li>
            <li>Do not chase losses</li>
            <li>Do not gamble when stressed, angry, or under pressure</li>
            <li>Never treat betting as guaranteed income</li>
          </ul>
        </section>

        <section style={{ marginBottom: 14 }}>
          <h2 style={{ margin: '0 0 6px', fontSize: 18, fontWeight: 800, color: '#f1f5f9' }}>Warning Signs</h2>
          <ul style={{ margin: '0 0 8px 18px' }}>
            <li>You regularly spend more than planned</li>
            <li>You hide betting activity from family or friends</li>
            <li>You borrow money to continue gambling</li>
            <li>You feel anxious, guilty, or unable to stop</li>
          </ul>
        </section>

        <section style={{ marginBottom: 14 }}>
          <h2 style={{ margin: '0 0 6px', fontSize: 18, fontWeight: 800, color: '#f1f5f9' }}>Support Resources</h2>
          <ul style={{ margin: '0 0 8px 18px' }}>
            <li>BeGambleAware: https://www.begambleaware.org</li>
            <li>GamCare: https://www.gamcare.org.uk</li>
            <li>National Problem Gambling Helpline (US): 1-800-GAMBLER</li>
            <li>Gambling Therapy: https://www.gamblingtherapy.org</li>
          </ul>
        </section>

        <section>
          <h2 style={{ margin: '0 0 6px', fontSize: 18, fontWeight: 800, color: '#f1f5f9' }}>Age Restriction</h2>
          <p style={{ margin: 0 }}>You must be at least 18 years old, or the legal age in your jurisdiction, to use the platform.</p>
        </section>
      </main>
    </div>
  )
}
