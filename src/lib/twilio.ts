import twilio from 'twilio'

export class TwilioConfigError extends Error {
  constructor(missing: string[]) {
    super(`Missing Twilio env vars: ${missing.join(', ')}`)
    this.name = 'TwilioConfigError'
  }
}

function validateTwilioConfig() {
  const required = ['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_VERIFY_SERVICE_SID']
  const missing = required.filter((key) => !process.env[key])
  if (missing.length > 0) {
    throw new TwilioConfigError(missing)
  }
}

function getClient() {
  validateTwilioConfig()
  return twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN)
}

export async function sendVerificationCode(phone: string) {
  const client = getClient()
  return client.verify.v2
    .services(process.env.TWILIO_VERIFY_SERVICE_SID as string)
    .verifications.create({ to: phone, channel: 'sms' })
}

export async function checkVerificationCode(phone: string, code: string) {
  const client = getClient()
  const check = await client.verify.v2
    .services(process.env.TWILIO_VERIFY_SERVICE_SID as string)
    .verificationChecks.create({ to: phone, code })
  return check.status === 'approved'
}

interface TwilioErrorInfo {
  code?: number
  status?: number
  message?: string
  moreInfo?: string
}

function extractTwilioError(error: unknown): TwilioErrorInfo {
  if (error && typeof error === 'object') {
    const e = error as Record<string, unknown>
    return {
      code: typeof e.code === 'number' ? e.code : undefined,
      status: typeof e.status === 'number' ? e.status : undefined,
      message: typeof e.message === 'string' ? e.message : undefined,
      moreInfo: typeof e.moreInfo === 'string' ? e.moreInfo : undefined,
    }
  }
  return { message: String(error) }
}

const SEND_ERROR_MAP: Record<number, { userMessage: string; httpStatus: number }> = {
  60200: { userMessage: 'Invalid phone number format.', httpStatus: 400 },
  60203: { userMessage: 'Too many verification attempts. Please wait 10 minutes.', httpStatus: 429 },
  60212: { userMessage: 'Too many codes sent. Please wait a few minutes.', httpStatus: 429 },
  20003: { userMessage: 'SMS service temporarily unavailable. Please try again later.', httpStatus: 503 },
  20404: { userMessage: 'SMS service temporarily unavailable. Please try again later.', httpStatus: 503 },
}

const CHECK_ERROR_MAP: Record<number, { userMessage: string; httpStatus: number }> = {
  60200: { userMessage: 'Invalid verification code format.', httpStatus: 400 },
  20404: { userMessage: 'Verification expired. Please request a new code.', httpStatus: 410 },
  60202: { userMessage: 'Too many incorrect attempts. Request a new code.', httpStatus: 429 },
}

export function getTwilioSendError(error: unknown): { userMessage: string; httpStatus: number } {
  if (error instanceof TwilioConfigError) {
    return { userMessage: 'SMS service is not configured. Please contact an admin.', httpStatus: 503 }
  }
  const info = extractTwilioError(error)
  if (info.code && SEND_ERROR_MAP[info.code]) {
    return SEND_ERROR_MAP[info.code]
  }
  return { userMessage: 'Failed to send verification code. Please try again.', httpStatus: 500 }
}

export function getTwilioCheckError(error: unknown): { userMessage: string; httpStatus: number } {
  if (error instanceof TwilioConfigError) {
    return { userMessage: 'SMS service is not configured. Please contact an admin.', httpStatus: 503 }
  }
  const info = extractTwilioError(error)
  if (info.code && CHECK_ERROR_MAP[info.code]) {
    return CHECK_ERROR_MAP[info.code]
  }
  return { userMessage: 'Verification failed. Please try again.', httpStatus: 500 }
}

export function logTwilioError(errorType: string, error: unknown, phoneLast4?: string) {
  const info = extractTwilioError(error)
  console.error(JSON.stringify({
    error_type: errorType,
    twilio_code: info.code,
    twilio_status: info.status,
    message: info.message,
    more_info: info.moreInfo,
    phone_last4: phoneLast4,
  }))
}
