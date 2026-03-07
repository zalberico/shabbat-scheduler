import { clsx, type ClassValue } from 'clsx'
import { nextFriday, format, isBefore, startOfDay } from 'date-fns'

export function cn(...inputs: ClassValue[]) {
  return clsx(inputs)
}

export function getNextFriday(): Date {
  const now = new Date()
  const today = startOfDay(now)
  // If today is Friday, use today; otherwise get next Friday
  if (today.getDay() === 5) {
    return today
  }
  return startOfDay(nextFriday(now))
}

export function getWeekOf(): string {
  return format(getNextFriday(), 'yyyy-MM-dd')
}

export function formatWeekOf(dateStr: string): string {
  return format(new Date(dateStr + 'T12:00:00'), 'MMMM d, yyyy')
}

export function isBeforeDeadline(): boolean {
  const now = new Date()
  const friday = getNextFriday()
  // Deadline is Wednesday 11:59 PM PT before the Friday
  const deadline = new Date(friday)
  deadline.setDate(deadline.getDate() - 2) // Wednesday
  deadline.setHours(23, 59, 59, 999)
  return isBefore(now, deadline)
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
