const APP_TODAY_ISO = '2026-02-17'

export function getAppToday() {
  return new Date(`${APP_TODAY_ISO}T12:00:00`)
}

export function getAppTodayIso() {
  return APP_TODAY_ISO
}

export function isAppTodayIso(dateStr = '') {
  return String(dateStr || '').slice(0, 10) === APP_TODAY_ISO
}
