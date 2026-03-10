export function isMobileViewport(maxWidth = 768) {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false
  return window.matchMedia(`(max-width: ${maxWidth}px)`).matches
}

export function formatAppDate(value, options = {}) {
  if (!value) return '-'
  const d = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(d.getTime())) return '-'

  const {
    locale = 'en-GB',
    compact,
    compactOnMobile = true,
    mobileMaxWidth = 768,
  } = options

  const useCompact = typeof compact === 'boolean'
    ? compact
    : (compactOnMobile && isMobileViewport(mobileMaxWidth))

  if (useCompact) {
    return d.toLocaleDateString(locale, { day: '2-digit', month: '2-digit', year: '2-digit' })
  }
  return d.toLocaleDateString(locale, { day: '2-digit', month: 'short', year: 'numeric' })
}

