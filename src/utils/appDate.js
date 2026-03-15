export function getAppToday() {
  const now = new Date()
  return new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12, 0, 0, 0)
}

export function getAppTodayIso() {
  const today = getAppToday()
  const year = today.getFullYear()
  const month = String(today.getMonth() + 1).padStart(2, '0')
  const day = String(today.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function isAppTodayIso(dateStr = '') {
  return String(dateStr || '').slice(0, 10) === getAppTodayIso()
}
