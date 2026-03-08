'use client'

import { getFutureFridays, formatWeekOf, getWeekOf } from '@/lib/utils'

interface WeekPickerProps {
  selected: string
  onChange: (weekOf: string) => void
}

export default function WeekPicker({ selected, onChange }: WeekPickerProps) {
  const fridays = getFutureFridays(6)
  const thisWeek = getWeekOf()

  return (
    <select
      value={selected}
      onChange={(e) => onChange(e.target.value)}
      className="input"
      aria-label="Select week"
    >
      {fridays.map((f) => (
        <option key={f} value={f}>
          Friday, {formatWeekOf(f)}{f === thisWeek ? ' (this week)' : ''}
        </option>
      ))}
    </select>
  )
}
