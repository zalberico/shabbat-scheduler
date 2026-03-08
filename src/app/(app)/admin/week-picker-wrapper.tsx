'use client'

import { useRouter } from 'next/navigation'
import WeekPicker from '@/components/week-picker'

interface Props {
  selected: string
  basePath: string
}

export default function AdminWeekPicker({ selected, basePath }: Props) {
  const router = useRouter()

  return (
    <WeekPicker
      selected={selected}
      onChange={(weekOf) => router.push(`${basePath}?week=${weekOf}`)}
    />
  )
}
