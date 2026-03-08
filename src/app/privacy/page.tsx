export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-[var(--color-warm)] py-12 px-4">
      <div className="max-w-2xl mx-auto">
        <h1 className="page-title mb-8">Privacy Policy</h1>

        <div className="card space-y-6 text-sm text-gray-700 leading-relaxed">
          <p className="text-gray-500">Last updated: March 7, 2026</p>

          <section>
            <h2 className="text-lg font-semibold text-[var(--color-primary)] mb-2">
              What We Collect
            </h2>
            <p>
              When you sign up for Shabbat Scheduler, we collect your name, phone number,
              email address, and meal preferences (dietary restrictions, kashrut level,
              neighborhood, and hosting availability). This information is necessary to
              match you with other community members for Shabbat meals.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-[var(--color-primary)] mb-2">
              How We Use Your Data
            </h2>
            <ul className="list-disc pl-5 space-y-1">
              <li>To match hosts and guests for Shabbat meals each week</li>
              <li>To send you email notifications about your matches</li>
              <li>To send SMS verification codes during signup (via Twilio)</li>
              <li>To send optional weekly reminder emails</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-[var(--color-primary)] mb-2">
              What We Do Not Do
            </h2>
            <ul className="list-disc pl-5 space-y-1">
              <li>We do not sell or share your personal information with third parties</li>
              <li>We do not use your data for marketing or advertising</li>
              <li>We do not send unsolicited SMS messages — verification codes are only sent when you request them</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-[var(--color-primary)] mb-2">
              Third-Party Services
            </h2>
            <p>We use the following services to operate Shabbat Scheduler:</p>
            <ul className="list-disc pl-5 space-y-1 mt-2">
              <li><strong>Supabase</strong> — database and authentication</li>
              <li><strong>Twilio</strong> — SMS verification codes during signup</li>
              <li><strong>Resend</strong> — email notifications</li>
              <li><strong>Vercel</strong> — hosting</li>
            </ul>
            <p className="mt-2">
              These services only process your data as needed to provide their
              functionality. They do not use your data for their own purposes.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-[var(--color-primary)] mb-2">
              Data Retention
            </h2>
            <p>
              Your data is retained as long as you have an active account. You can
              request deletion of your account and associated data at any time by
              contacting an admin.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-[var(--color-primary)] mb-2">
              Contact
            </h2>
            <p>
              If you have questions about this privacy policy or your data, please
              reach out to a community admin.
            </p>
          </section>
        </div>
      </div>
    </main>
  )
}
