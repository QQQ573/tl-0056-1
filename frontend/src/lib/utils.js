export const BRANDS = {
  MEITUAN: { id: 'meituan', name: '美团', color: '#FFD100' },
  ELEME: { id: 'eleme', name: '饿了么', color: '#0097FF' },
  WALLACE: { id: 'wallace', name: '华莱士', color: '#E60012' }
}

export const ORDER_STATUS = {
  PENDING: 'pending',
  ASSIGNED: 'assigned',
  CONFIRMED: 'confirmed'
}

export const TIMER_THRESHOLDS = {
  GREEN: 15 * 60,
  YELLOW: 8 * 60
}

export function getTimerColor(remainingSeconds) {
  if (remainingSeconds >= TIMER_THRESHOLDS.GREEN) return 'green'
  if (remainingSeconds >= TIMER_THRESHOLDS.YELLOW) return 'yellow'
  return 'red'
}

export function haversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371
  const toRad = (deg) => (deg * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLon = toRad(lon2 - lon1)
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return R * c
}

export function estimateTravelMinutes(distanceKm) {
  const avgSpeedKmh = 25
  return Math.ceil((distanceKm / avgSpeedKmh) * 60)
}

export function formatTime(seconds) {
  const abs = Math.abs(seconds)
  const m = Math.floor(abs / 60)
  const s = Math.floor(abs % 60)
  const sign = seconds < 0 ? '-' : ''
  return `${sign}${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

export function getTimeoutRiskScore(order) {
  return -order.remainingSeconds
}
