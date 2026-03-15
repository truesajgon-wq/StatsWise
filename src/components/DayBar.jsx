import { useEffect, useState } from 'react'
import { getAppToday } from '../utils/appDate.js'

function ChevronLeft() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <path d="M9 2L4.5 7L9 12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  )
}
function ChevronRight() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <path d="M5 2L9.5 7L5 12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  )
}

function formatDay(d) {
  const now = getAppToday()
  const base = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const target = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  const diff = Math.round((target - base) / 86400000)
  if (diff === 0) return 'Today'
  if (diff === -1) return 'Yesterday'
  if (diff === 1) return 'Tomorrow'
  return d.toLocaleDateString('en-GB', { weekday: 'short' })
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

  const chevronStyle = (enabled) => ({
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    color: enabled ? '#8fa3bc' : '#3d526e',
    cursor: enabled ? 'pointer' : 'not-allowed',
    transition: 'color 0.15s ease',
  })

  if (isMobile) {
    return (
      <div className="day-bar-mobile" style={{
        background: 'var(--sw-surface-0)',
        borderBottom: 'var(--row-separator)',
        display: 'grid', gridTemplateColumns: '44px 1fr 44px',
        alignItems: 'center', padding: '8px 10px', gap: 8,
      }}>
        <button
          className="day-bar-mobile-button"
          onClick={handlePrev} disabled={!canPrev}
          style={{ width: 44, height: 44, borderRadius: 8, border: '1px solid var(--sw-border)', background: 'transparent', justifySelf: 'start', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', ...chevronStyle(canPrev) }}
        >
          <ChevronLeft />
        </button>

        <div style={{ textAlign: 'center', color: '#f0f4f8' }}>
          <div className="day-bar-mobile-label" style={{ fontSize: 15, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {selectedDay ? formatDay(selectedDay) : '-'}
          </div>
          <div style={{ fontSize: 11, marginTop: 2, color: '#8fa3bc' }}>
            {selectedDay ? selectedDay.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit' }) : ''}
          </div>
        </div>

        <button
          className="day-bar-mobile-button"
          onClick={handleNext} disabled={!canNext}
          style={{ width: 44, height: 44, borderRadius: 8, border: '1px solid var(--sw-border)', background: 'transparent', justifySelf: 'end', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', ...chevronStyle(canNext) }}
        >
          <ChevronRight />
        </button>
      </div>
    )
  }

  return (
    <div className="day-bar-desktop" style={{ background: 'var(--sw-surface-0)', borderBottom: 'var(--row-separator)', display: 'flex', justifyContent: 'center' }}>
      <div style={{
        width: '100%', maxWidth,
        display: 'grid',
        gridTemplateColumns: `36px repeat(${days.length}, minmax(0, 1fr)) 36px`,
        alignItems: 'stretch',
        transform: centerShiftDesktop ? `translateX(${centerShiftDesktop}px)` : 'none',
      }}>
        <button
          className="day-bar-desktop-button"
          onClick={handlePrev} disabled={!canPrev}
          aria-label="Previous day"
          style={{ width: 36, height: '100%', minHeight: 52, border: 'none', borderRight: '1px solid var(--sw-border)', background: 'transparent', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', ...chevronStyle(canPrev) }}
          onMouseEnter={e => { if (canPrev) e.currentTarget.style.color = '#f0f4f8' }}
          onMouseLeave={e => { e.currentTarget.style.color = canPrev ? '#8fa3bc' : '#3d526e' }}
        >
          <ChevronLeft />
        </button>

        {days.map((d, i) => {
          const isSelected = selectedIdx === i
          return (
            <button
              key={i}
              onClick={() => onSelect(i)}
              className="day-bar-desktop-button"
              style={{
                minWidth: 0,
                padding: '10px 6px',
                background: 'none',
                border: 'none',
                borderBottom: isSelected ? '2px solid #f97316' : '2px solid transparent',
                color: isSelected ? '#f0f4f8' : '#6b83a0',
                fontWeight: isSelected ? 700 : 400,
                cursor: 'pointer',
                fontSize: 12,
                transition: 'color 0.15s ease, border-color 0.15s ease',
              }}
              onMouseEnter={e => { if (!isSelected) e.currentTarget.style.color = '#a8bcd4' }}
              onMouseLeave={e => { if (!isSelected) e.currentTarget.style.color = '#6b83a0' }}
            >
              <span style={{ display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%' }}>{formatDay(d)}</span>
              <span style={{ display: 'block', fontSize: 10, marginTop: 2, opacity: 0.65 }}>
                {d.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit' })}
              </span>
            </button>
          )
        })}

        <button
          className="day-bar-desktop-button"
          onClick={handleNext} disabled={!canNext}
          aria-label="Next day"
          style={{ width: 36, height: '100%', minHeight: 52, border: 'none', borderLeft: '1px solid var(--sw-border)', background: 'transparent', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', ...chevronStyle(canNext) }}
          onMouseEnter={e => { if (canNext) e.currentTarget.style.color = '#f0f4f8' }}
          onMouseLeave={e => { e.currentTarget.style.color = canNext ? '#8fa3bc' : '#3d526e' }}
        >
          <ChevronRight />
        </button>
      </div>
    </div>
  )
}
