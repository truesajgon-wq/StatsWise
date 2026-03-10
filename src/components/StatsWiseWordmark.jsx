export default function StatsWiseWordmark({ compact = false, color = '#f8fafc' }) {
  return (
    <span className="statswise-wordmark" style={{ display: 'inline-flex', alignItems: 'center', gap: compact ? 8 : 10, minWidth: 0 }}>
      <span
        aria-hidden="true"
        style={{
          width: compact ? 18 : 20,
          height: compact ? 14 : 16,
          position: 'relative',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        <span
          style={{
            position: 'absolute',
            width: compact ? 5 : 6,
            height: compact ? 14 : 16,
            borderRadius: 3,
            transform: 'rotate(28deg) translateX(-3px)',
            background: 'linear-gradient(180deg,#ff6a00 0%,#ff2f3f 100%)',
          }}
        />
        <span
          style={{
            position: 'absolute',
            width: compact ? 5 : 6,
            height: compact ? 14 : 16,
            borderRadius: 3,
            transform: 'rotate(28deg) translateX(4px)',
            background: 'linear-gradient(180deg,#ff3d00 0%,#ff1744 100%)',
          }}
        />
      </span>
      <span style={{ color, fontWeight: 900, letterSpacing: '-0.02em', fontSize: compact ? 29 : 22, lineHeight: 1 }}>
        StatsWise
      </span>
      <span style={{ color: '#94a3b8', fontWeight: 700, fontSize: compact ? 8 : 9, letterSpacing: '0.06em', alignSelf: 'flex-start', marginTop: compact ? 3 : 2 }}>
        TM
      </span>
    </span>
  )
}
