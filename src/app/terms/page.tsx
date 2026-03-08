export default function TermsPage() {
  return (
    <main className="min-h-screen bg-[var(--color-warm)] py-12 px-4">
      <div className="max-w-2xl mx-auto">
        <h1 className="page-title mb-8">Terms & Conditions</h1>

        <div className="card space-y-6 text-sm text-gray-700 leading-relaxed">
          <p className="text-gray-500">Last updated: March 7, 2026</p>

          <section>
            <h2 className="text-lg font-semibold text-[var(--color-primary)] mb-2">
              Program Name
            </h2>
            <p>Shabbat Scheduler</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-[var(--color-primary)] mb-2">
              Program Description
            </h2>
            <p>
              Shabbat Scheduler is a community tool that matches hosts and guests
              for Shabbat meals each week. During account signup, we send a one-time
              SMS verification code to confirm your phone number.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-[var(--color-primary)] mb-2">
              Message Frequency
            </h2>
            <p>
              You will receive a single SMS message containing a verification code
              when you sign up. No recurring or promotional messages are sent.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-[var(--color-primary)] mb-2">
              Message & Data Rates
            </h2>
            <p>
              Standard message and data rates may apply depending on your mobile
              carrier and plan. Shabbat Scheduler does not charge for SMS messages.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-[var(--color-primary)] mb-2">
              Opt-Out Instructions
            </h2>
            <p>
              To stop receiving SMS messages from Shabbat Scheduler, reply{' '}
              <strong>STOP</strong> to any message. You will receive a confirmation
              and no further messages will be sent.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-[var(--color-primary)] mb-2">
              Help
            </h2>
            <p>
              For support, reply <strong>HELP</strong> to any message or contact a
              community admin.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-[var(--color-primary)] mb-2">
              Privacy
            </h2>
            <p>
              Your phone number is used solely for verification purposes and is not
              shared with third parties for marketing. See our{' '}
              <a
                href="/privacy"
                className="text-[var(--color-accent)] underline hover:opacity-80"
              >
                Privacy Policy
              </a>{' '}
              for full details.
            </p>
          </section>
        </div>
      </div>
    </main>
  )
}
