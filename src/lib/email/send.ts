import { Resend } from 'resend'
import type { CreateEmailOptions } from 'resend'

// resend v6 returns { data, error } instead of throwing on API errors
// (rate limits, bad recipients, etc.). Throw here so call-site try/catch
// blocks and sent counters reflect reality.
export async function sendEmail(payload: CreateEmailOptions) {
  const resend = new Resend(process.env.RESEND_API_KEY)
  const { data, error } = await resend.emails.send(payload)
  if (error) {
    throw new Error(`Resend ${error.name}: ${error.message}`)
  }
  return data
}
