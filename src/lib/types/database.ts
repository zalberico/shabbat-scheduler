export type KashrutLevel = 'none' | 'kosher_style' | 'strict_kosher' | 'glatt_kosher'
export type ShabbatObservance = 'flexible' | 'traditional' | 'shomer_shabbat'
export type HostStatus = 'open' | 'matched' | 'cancelled'
export type GuestStatus = 'pending' | 'matched' | 'unmatched'

export const KASHRUT_LEVELS: { value: KashrutLevel; label: string }[] = [
  { value: 'none', label: 'No kashrut requirements' },
  { value: 'kosher_style', label: 'Kosher-style (no pork/shellfish)' },
  { value: 'strict_kosher', label: 'Strict kosher' },
  { value: 'glatt_kosher', label: 'Glatt kosher' },
]

export const KASHRUT_RANK: Record<KashrutLevel, number> = {
  none: 0,
  kosher_style: 1,
  strict_kosher: 2,
  glatt_kosher: 3,
}

export const OBSERVANCE_LEVELS: { value: ShabbatObservance; label: string }[] = [
  { value: 'flexible', label: 'Flexible' },
  { value: 'traditional', label: 'Traditional' },
  { value: 'shomer_shabbat', label: 'Shomer Shabbat' },
]

export const OBSERVANCE_RANK: Record<ShabbatObservance, number> = {
  flexible: 0,
  traditional: 1,
  shomer_shabbat: 2,
}

export const DIETARY_OPTIONS = [
  'vegetarian',
  'vegan',
  'pescatarian',
  'gluten-free',
  'nut allergy',
  'dairy-free',
] as const

export const START_TIMES = [
  'candle_lighting',
  '6:00 PM',
  '6:30 PM',
  '7:00 PM',
  '7:30 PM',
  '8:00 PM',
] as const

export interface Database {
  public: {
    Tables: {
      users: {
        Row: {
          id: string
          email: string
          name: string
          phone: string
          default_dietary_restrictions: string[]
          default_kashrut_preference: KashrutLevel
          default_shabbat_observance: ShabbatObservance
          is_admin: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          email: string
          name: string
          phone: string
          default_dietary_restrictions?: string[]
          default_kashrut_preference?: KashrutLevel
          default_shabbat_observance?: ShabbatObservance
          is_admin?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          email?: string
          name?: string
          phone?: string
          default_dietary_restrictions?: string[]
          default_kashrut_preference?: KashrutLevel
          default_shabbat_observance?: ShabbatObservance
          is_admin?: boolean
          updated_at?: string
        }
      }
      phone_allowlist: {
        Row: {
          id: string
          phone: string
          uploaded_at: string
        }
        Insert: {
          id?: string
          phone: string
          uploaded_at?: string
        }
        Update: {
          phone?: string
        }
      }
      weekly_hosts: {
        Row: {
          id: string
          user_id: string
          week_of: string
          seats_available: number
          kashrut_level: KashrutLevel
          observance_level: ShabbatObservance
          start_time: string
          walking_distance_only: boolean
          address: string | null
          lat: number | null
          lng: number | null
          notes: string | null
          kids_friendly: boolean
          dogs_friendly: boolean
          status: HostStatus
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          week_of: string
          seats_available: number
          kashrut_level: KashrutLevel
          observance_level?: ShabbatObservance
          start_time: string
          walking_distance_only?: boolean
          address?: string | null
          lat?: number | null
          lng?: number | null
          notes?: string | null
          kids_friendly?: boolean
          dogs_friendly?: boolean
          status?: HostStatus
          created_at?: string
        }
        Update: {
          seats_available?: number
          kashrut_level?: KashrutLevel
          observance_level?: ShabbatObservance
          start_time?: string
          walking_distance_only?: boolean
          address?: string | null
          lat?: number | null
          lng?: number | null
          notes?: string | null
          kids_friendly?: boolean
          dogs_friendly?: boolean
          status?: HostStatus
        }
      }
      weekly_guests: {
        Row: {
          id: string
          user_id: string
          week_of: string
          party_size: number
          dietary_restrictions: string[]
          kashrut_requirement: KashrutLevel
          observance_requirement: ShabbatObservance
          can_walk: boolean
          address: string | null
          lat: number | null
          lng: number | null
          notes: string | null
          needs_kid_friendly: boolean
          needs_dog_friendly: boolean
          status: GuestStatus
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          week_of: string
          party_size: number
          dietary_restrictions?: string[]
          kashrut_requirement?: KashrutLevel
          observance_requirement?: ShabbatObservance
          can_walk?: boolean
          address?: string | null
          lat?: number | null
          lng?: number | null
          notes?: string | null
          needs_kid_friendly?: boolean
          needs_dog_friendly?: boolean
          status?: GuestStatus
          created_at?: string
        }
        Update: {
          party_size?: number
          dietary_restrictions?: string[]
          kashrut_requirement?: KashrutLevel
          observance_requirement?: ShabbatObservance
          can_walk?: boolean
          address?: string | null
          lat?: number | null
          lng?: number | null
          notes?: string | null
          needs_kid_friendly?: boolean
          needs_dog_friendly?: boolean
          status?: GuestStatus
        }
      }
      matches: {
        Row: {
          id: string
          week_of: string
          host_id: string
          created_at: string
        }
        Insert: {
          id?: string
          week_of: string
          host_id: string
          created_at?: string
        }
        Update: {
          week_of?: string
          host_id?: string
        }
      }
      match_guests: {
        Row: {
          id: string
          match_id: string
          guest_id: string
        }
        Insert: {
          id?: string
          match_id: string
          guest_id: string
        }
        Update: {
          match_id?: string
          guest_id?: string
        }
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
  }
}
