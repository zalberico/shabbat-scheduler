import { clsx, type ClassValue } from 'clsx'
import { format, startOfDay, addWeeks, parseISO } from 'date-fns'

export function cn(...inputs: ClassValue[]) {
  return clsx(inputs)
}

const PT_TIME_ZONE = 'America/Los_Angeles'

// Today's calendar date in Pacific Time, as a local-midnight Date.
// Anchoring to PT keeps week boundaries and deadlines identical whether
// this runs on Vercel (UTC) or in a user's browser.
function todayInPT(): Date {
  const ymd = new Intl.DateTimeFormat('en-CA', {
    timeZone: PT_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
  return parseISO(ymd)
}

export function getNextFriday(): Date {
  const today = todayInPT()
  // If today is Friday (in PT), use today; otherwise get next Friday
  const daysUntilFriday = (5 - today.getDay() + 7) % 7
  const friday = new Date(today)
  friday.setDate(friday.getDate() + daysUntilFriday)
  return friday
}

export function getWeekOf(): string {
  return format(getNextFriday(), 'yyyy-MM-dd')
}

export function formatWeekOf(dateStr: string): string {
  return format(new Date(dateStr + 'T12:00:00'), 'MMMM d, yyyy')
}

export function isBeforeDeadline(weekOf?: string): boolean {
  const friday = weekOf
    ? startOfDay(parseISO(weekOf))
    : getNextFriday()
  // Deadline is Wednesday 11:59 PM PT before the Friday, regardless of
  // the runtime timezone
  const wednesday = new Date(friday)
  wednesday.setDate(wednesday.getDate() - 2)
  const y = wednesday.getFullYear()
  const m = wednesday.getMonth()
  const d = wednesday.getDate()
  // PT's UTC offset on that Wednesday (7 during PDT, 8 during PST)
  const ptHourAtNoonUtc = Number(
    new Intl.DateTimeFormat('en-US', {
      timeZone: PT_TIME_ZONE,
      hour: '2-digit',
      hourCycle: 'h23',
    }).format(new Date(Date.UTC(y, m, d, 12)))
  )
  const ptOffsetHours = 12 - ptHourAtNoonUtc
  const deadlineMs = Date.UTC(y, m, d, 23, 59, 59, 999) + ptOffsetHours * 3600 * 1000
  return Date.now() < deadlineMs
}

export function getFutureFridays(count: number): string[] {
  const first = getNextFriday()
  return Array.from({ length: count }, (_, i) =>
    format(addWeeks(first, i), 'yyyy-MM-dd')
  )
}

export function isValidFutureFriday(weekOf: string): boolean {
  const date = parseISO(weekOf)
  if (isNaN(date.getTime())) return false
  if (date.getDay() !== 5) return false
  return date >= startOfDay(getNextFriday())
}

export function normalizePhone(phone: string): string {
  // Strip everything except digits
  const digits = phone.replace(/\D/g, '')
  // If 10 digits, assume US and add country code
  if (digits.length === 10) {
    return `+1${digits}`
  }
  // If 11 digits starting with 1, add +
  if (digits.length === 11 && digits.startsWith('1')) {
    return `+${digits}`
  }
  // Otherwise, add + if not present
  return `+${digits}`
}

export function formatStartTime(time: string): string {
  if (time === 'candle_lighting') return 'Candle lighting'
  return time
}

export function approximateArea(address: string | null): string {
  if (!address?.trim()) return 'Location not shared'
  // Remove street number and name, keep city/state/zip
  // Typical format: "123 Main St, Brooklyn, NY 11201"
  const parts = address.split(',').map((p) => p.trim())
  if (parts.length >= 2) {
    return parts.slice(1).join(', ')
  }
  return 'Location not shared'
}

export function haversineDistanceMiles(
  lat1: number, lng1: number,
  lat2: number, lng2: number
): number {
  const R = 3958.8 // Earth radius in miles
  const toRad = (deg: number) => (deg * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  // Apply 1.3x walking factor (streets aren't straight lines)
  return R * c * 1.3
}
