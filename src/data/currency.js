const BASE_MONTHLY_PLN = 34.99
const BASE_YEARLY_PLN = 314.91
const BASE_YEARLY_MONTHLY_PLN = 26.24

const RATES = {
  PLN: 1,
  USD: 0.245,
  GBP: 0.195,
  EUR: 0.228,
  UAH: 10.1,
  RUB: 22.5,
}

export const COUNTRY_CURRENCY = {
  Poland: { currency: 'PLN', symbol: 'zl', locale: 'pl-PL' },
  'United States': { currency: 'USD', symbol: '$', locale: 'en-US' },
  'United Kingdom': { currency: 'GBP', symbol: 'GBP ', locale: 'en-GB' },
  Germany: { currency: 'EUR', symbol: 'EUR ', locale: 'de-DE' },
  France: { currency: 'EUR', symbol: 'EUR ', locale: 'fr-FR' },
  Spain: { currency: 'EUR', symbol: 'EUR ', locale: 'es-ES' },
  Italy: { currency: 'EUR', symbol: 'EUR ', locale: 'it-IT' },
  Netherlands: { currency: 'EUR', symbol: 'EUR ', locale: 'nl-NL' },
  Ukraine: { currency: 'UAH', symbol: 'UAH ', locale: 'uk-UA' },
  Russia: { currency: 'RUB', symbol: 'RUB ', locale: 'ru-RU' },
  'Czech Republic': { currency: 'EUR', symbol: 'EUR ', locale: 'cs-CZ' },
  Slovakia: { currency: 'EUR', symbol: 'EUR ', locale: 'sk-SK' },
  Hungary: { currency: 'EUR', symbol: 'EUR ', locale: 'hu-HU' },
  Romania: { currency: 'EUR', symbol: 'EUR ', locale: 'ro-RO' },
  Other: { currency: 'EUR', symbol: 'EUR ', locale: 'en-GB' },
}

export const COUNTRIES = Object.keys(COUNTRY_CURRENCY)

function convert(pln, currency) {
  const rate = RATES[currency] || 1
  const converted = pln * rate
  if (converted < 5) return Math.round(converted * 100) / 100
  if (converted < 50) return Math.round(converted * 10) / 10
  return Math.round(converted)
}

export function getPricing(country) {
  const cc = COUNTRY_CURRENCY[country] || COUNTRY_CURRENCY.Poland
  const { currency, symbol } = cc

  const monthly = convert(BASE_MONTHLY_PLN, currency)
  const yearly = convert(BASE_YEARLY_PLN, currency)
  const yearlyMonthly = convert(BASE_YEARLY_MONTHLY_PLN, currency)
  const trialDays = 7

  const fmt = n => `${symbol}${n}`

  return {
    currency,
    symbol,
    monthly,
    yearly,
    yearlyMonthly,
    trialDays,
    monthlyFmt: fmt(monthly),
    yearlyFmt: fmt(yearly),
    yearlyMonthlyFmt: fmt(yearlyMonthly),
    savingsFmt: fmt(convert(BASE_MONTHLY_PLN * 12 - BASE_YEARLY_PLN, currency)),
  }
}

