import { Link } from 'react-router-dom'

export default function AppFooter() {
  return (
    <footer
      className="site-footer"
      style={{
        width: '100%',
        borderTop: '1px solid var(--sw-border)',
        background: 'linear-gradient(180deg, rgba(16,26,42,0.96), rgba(9,17,29,0.98))',
        padding: '14px 16px',
        color: '#94a3b8',
        fontSize: 12,
        lineHeight: 1.55,
        flexShrink: 0,
        textAlign: 'center',
      }}
    >
      <div className="footer-links" style={{ marginBottom: 8, color: '#cbd5e1', fontWeight: 600 }}>
        <Link to="/terms" style={{ color: '#e5e7eb', textDecoration: 'none' }}>
          Terms &amp; Conditions
        </Link>{' '}
        |{' '}
        <Link to="/privacy" style={{ color: '#e5e7eb', textDecoration: 'none' }}>
          Privacy Policy
        </Link>{' '}
        |{' '}
        <Link to="/responsible-gambling" style={{ color: '#e5e7eb', textDecoration: 'none' }}>
          Responsible Gambling
        </Link>
      </div>

      <p className="disclaimer" style={{ margin: '0 0 8px' }}>
        All predictions and statistics on this site are for informational and entertainment purposes only.
        We do not accept bets or guarantee profits.
      </p>

      <p className="responsible-gambling" style={{ margin: '0 0 8px' }}>
        Please gamble responsibly. You must be 18 years or older, or the legal age in your jurisdiction, to use this site.
        If you or someone you know has a gambling problem, visit{' '}
        <a href="https://www.begambleaware.org" target="_blank" rel="noreferrer" style={{ color: '#e5e7eb' }}>
          BeGambleAware.org
        </a>
        ,{' '}
        <a href="https://www.gamcare.org.uk" target="_blank" rel="noreferrer" style={{ color: '#e5e7eb' }}>
          GamCare
        </a>{' '}
        or{' '}
        <a href="https://www.gamblingtherapy.org" target="_blank" rel="noreferrer" style={{ color: '#e5e7eb' }}>
          Gambling Therapy
        </a>
        .
      </p>

      <p className="copyright" style={{ margin: 0, color: '#64748b' }}>
        &copy; 2026 StatsWise. All rights reserved.
      </p>
    </footer>
  )
}
