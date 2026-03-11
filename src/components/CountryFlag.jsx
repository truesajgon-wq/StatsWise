function resolveFlagIconCode(countryCode, country) {
  const normalizedCountry = String(country || '').trim().toLowerCase()
  if (normalizedCountry === 'england') return 'gb-eng'
  if (normalizedCountry === 'scotland') return 'gb-sct'
  if (normalizedCountry === 'wales') return 'gb-wls'

  const normalizedCode = String(countryCode || '').trim().toLowerCase()
  if (/^[a-z]{2}$/.test(normalizedCode)) return normalizedCode
  return ''
}

export default function CountryFlag({ country, countryCode, flag = '', size = 18, alt = '' }) {
  const iconCode = resolveFlagIconCode(countryCode, country)

  if (iconCode) {
    return (
      <span
        className={`fi fi-${iconCode} country-flag-icon`}
        aria-label={alt || country || countryCode}
        title={alt || country || countryCode}
        style={{ width: Math.round(size * 1.35), height: size }}
      />
    )
  }

  if (flag) return <span style={{ fontSize: size, lineHeight: 1 }}>{flag}</span>
  return null
}
