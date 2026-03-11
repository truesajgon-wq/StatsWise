import { Link } from 'react-router-dom'

export default function AppFooter() {
  return (
    <footer
      className="site-footer"
      style={{
        width: '100%',
        borderTop: '1px solid rgba(255,255,255,0.08)',
        background: 'linear-gradient(180deg, rgba(12,13,16,0.99), rgba(7,8,10,1))',
        padding: '16px 16px 18px',
        color: '#8b98ab',
        fontSize: 12,
        lineHeight: 1.55,
        flexShrink: 0,
        textAlign: 'center',
      }}
    >
      <div className="footer-links" style={{ marginBottom: 10, color: '#cbd5e1', fontWeight: 700 }}>
        <Link to="/terms" style={{ color: '#e7edf6', textDecoration: 'none' }}>
          Terms &amp; Conditions
        </Link>{' '}
        |{' '}
        <Link to="/privacy" style={{ color: '#e7edf6', textDecoration: 'none' }}>
          Privacy Policy
        </Link>{' '}
        |{' '}
        <Link to="/responsible-gambling" style={{ color: '#e7edf6', textDecoration: 'none' }}>
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
        <a href="https://www.begambleaware.org" target="_blank" rel="noreferrer" style={{ color: '#e7edf6' }}>
          BeGambleAware.org
        </a>
        ,{' '}
        <a href="https://www.gamcare.org.uk" target="_blank" rel="noreferrer" style={{ color: '#e7edf6' }}>
          GamCare
        </a>{' '}
        or{' '}
        <a href="https://www.gamblingtherapy.org" target="_blank" rel="noreferrer" style={{ color: '#e7edf6' }}>
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
