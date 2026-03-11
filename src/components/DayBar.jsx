import { useEffect, useState } from 'react'
import { getAppToday } from '../utils/appDate.js'

function formatDay(d) {
  const now = getAppToday()
  const base = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const target = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  const diff = Math.round((target - base) / 86400000)
  if (diff === 0) return 'Today'
  if (diff === 1) return 'Tomorrow'
  if (diff === -1) return 'Yesterday'
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
}

export default function DayBar({ days, selectedIdx, onSelect, onPrev, onNext, maxWidth = 640, centerShiftDesktop = 0 }) {
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    const media = window.matchMedia('(max-width: 768px)')
    const apply = () => setIsMobile(media.matches)
    apply()
    if (media.addEventListener) {
      media.addEventListener('change', apply)
      return () => media.removeEventListener('change', apply)
    }
    media.addListener(apply)
    return () => media.removeListener(apply)
  }, [])

  const canPrev = typeof onPrev === 'function' || selectedIdx > 0
  const canNext = typeof onNext === 'function' || selectedIdx < days.length - 1
  const selectedDay = days[selectedIdx]
  const handlePrev = () => {
    if (typeof onPrev === 'function') onPrev()
    else if (selectedIdx > 0) onSelect(selectedIdx - 1)
  }
  const handleNext = () => {
    if (typeof onNext === 'function') onNext()
    else if (selectedIdx < days.length - 1) onSelect(selectedIdx + 1)
  }

  if (isMobile) {
    return (
      <div style={{ background: 'var(--sw-surface-0)', borderBottom: '1px solid var(--sw-border)', display: 'grid', gridTemplateColumns: '36px 1fr 36px', alignItems: 'center', padding: '8px 10px', gap: 8 }}>
        <button
          onClick={handlePrev}
          disabled={!canPrev}
          style={{ width: 32, height: 32, borderRadius: 8, border: '1px solid var(--sw-border)', background: 'transparent', color: canPrev ? '#cbd5e1' : '#4b5563', fontSize: 16, cursor: canPrev ? 'pointer' : 'not-allowed', justifySelf: 'start', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
        >
          {'<'}
        </button>
        <div style={{ minWidth: 0, textAlign: 'center', color: '#f8fafc' }}>
          <div style={{ fontSize: 16, fontWeight: 800, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{selectedDay ? formatDay(selectedDay) : '-'}</div>
          <div style={{ fontSize: 11, marginTop: 2, opacity: 0.75, color: '#94a3b8' }}>
            {selectedDay ? selectedDay.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit' }) : ''}
          </div>
        </div>
        <button
          onClick={handleNext}
          disabled={!canNext}
          style={{ width: 32, height: 32, borderRadius: 8, border: '1px solid var(--sw-border)', background: 'transparent', color: canNext ? '#cbd5e1' : '#4b5563', fontSize: 16, cursor: canNext ? 'pointer' : 'not-allowed', justifySelf: 'end', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
        >
          {'>'}
        </button>
      </div>
    )
  }

  return (
    <div style={{ background: 'var(--sw-surface-0)', borderBottom: '1px solid var(--sw-border)', display: 'flex', justifyContent: 'center' }}>
      <div style={{ width: '100%', maxWidth, display: 'grid', gridTemplateColumns: `36px repeat(${days.length}, minmax(0, 1fr)) 36px`, alignItems: 'stretch', transform: centerShiftDesktop ? `translateX(${centerShiftDesktop}px)` : 'none' }}>
        <button
          onClick={handlePrev}
          disabled={!canPrev}
          aria-label="Previous day"
          style={{ width: 32, height: '100%', minHeight: 54, borderRadius: 0, border: 'none', borderRight: '1px solid var(--sw-border)', background: 'transparent', color: canPrev ? '#9ca3af' : '#4b5563', fontSize: 16, cursor: canPrev ? 'pointer' : 'not-allowed', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
        >
          {'<'}
        </button>
        {days.map((d, i) => (
          <button
            key={i}
            onClick={() => onSelect(i)}
            className="flex flex-col items-center transition-all"
            style={{
              minWidth: 0,
              padding: '10px 8px',
              background: 'none',
              border: 'none',
              borderBottom: selectedIdx === i ? '2px solid #e5e7eb' : '2px solid transparent',
              color: selectedIdx === i ? '#f8fafc' : '#6b7280',
              fontWeight: selectedIdx === i ? 700 : 400,
              cursor: 'pointer',
              fontSize: 13,
            }}
          >
            <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%' }}>{formatDay(d)}</span>
            <span style={{ fontSize: 10, marginTop: 2, opacity: 0.6 }}>
              {d.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit' })}
            </span>
          </button>
        ))}
        <button
          onClick={handleNext}
          disabled={!canNext}
          aria-label="Next day"
          style={{ width: 32, height: '100%', minHeight: 54, borderRadius: 0, border: 'none', borderLeft: '1px solid var(--sw-border)', background: 'transparent', color: canNext ? '#9ca3af' : '#4b5563', fontSize: 16, cursor: canNext ? 'pointer' : 'not-allowed', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
        >
          {'>'}
        </button>
      </div>
    </div>
  )
}
