import Link from 'next/link'

const hostSteps = [
  'Pick a Friday (up to 6 weeks out) and set your seats, start time, kashrut, and observance level.',
  'Add a note about your table: potluck, kids welcome, vegetarian, whatever makes it yours.',
  'Your dinner shows up on Browse and members sign up directly. You see who’s coming as they join.',
]

const guestSteps = [
  'Browse every upcoming dinner: host, start time, kashrut, kids and dogs, and rough neighborhood.',
  'Pick the one you want and sign up with your party size and dietary needs.',
  'You’re confirmed on the spot, no waiting for Thursday.',
]

const timeline = [
  {
    when: 'Anytime before Wednesday',
    title: 'Host or sign up',
    desc: 'Hosts list dinners for any of the next 6 Fridays. Guests pick a dinner from Browse. Signups for each Friday close Wednesday at 11:59 PM PT.',
  },
  {
    when: 'Thursday morning',
    title: 'Tables are set',
    desc: 'If anyone asked to be matched, they’re placed in seats that are still open. Then everyone at each table gets one group email to coordinate.',
  },
  {
    when: 'Friday night',
    title: 'Shabbat dinner',
    desc: 'The host shares their address in the group email and you enjoy a Shabbat meal together.',
  },
]

const features = [
  { title: 'Kashrut Levels', desc: 'Every dinner lists its kashrut level, from flexible to glatt kosher, so you know what to expect before you sign up.' },
  { title: 'Observance Levels', desc: 'Hosts set the observance level of their dinner. Guests get a heads-up if a dinner doesn’t meet their minimum.' },
  { title: 'Walking Distance', desc: 'Guests who don’t drive on Shabbat can share an address so they’re only matched to hosts within walking distance.' },
  { title: 'Dietary Needs', desc: 'Vegetarian, vegan, gluten-free, nut allergy — hosts see each guest’s needs on their guest list.' },
  { title: 'Kids & Dogs', desc: 'Hosts mark whether kids and dogs are welcome, so families find the right table.' },
  { title: 'Plan Ahead', desc: 'Dinners can be listed up to 6 weeks in advance, so you can lock in a Friday early.' },
]

export default function Home() {
  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="bg-[var(--color-primary)] text-white py-4 px-6">
        <div className="max-w-5xl mx-auto flex justify-between items-center">
          <h1 className="text-xl font-bold">Shabbat Scheduler</h1>
          <div className="flex gap-3">
            <Link href="/login" className="btn-secondary !border-white !text-white hover:!bg-white hover:!text-[var(--color-primary)] text-sm !px-4 !py-2">
              Log in
            </Link>
            <Link href="/signup" className="bg-[var(--color-accent)] text-[var(--color-primary)] px-4 py-2 rounded-lg font-medium text-sm hover:bg-[var(--color-accent-light)] transition-colors">
              Sign up
            </Link>
          </div>
        </div>
      </header>

      <main className="flex-1">
        {/* Hero */}
        <section className="py-20 px-6">
          <div className="max-w-3xl mx-auto text-center">
            <h2 className="text-4xl md:text-5xl font-bold text-[var(--color-primary)] mb-6">
              Host a Shabbat dinner.<br />Or pick one to join.
            </h2>
            <p className="text-lg text-gray-600 mb-8 max-w-2xl mx-auto">
              The Noe Valley Chavurah&apos;s dinner board. Members open their tables on
              Friday nights, and everyone else browses and picks the dinner they want.
            </p>
            <div className="flex justify-center">
              <Link href="/signup" className="btn-primary text-lg px-8 py-3">
                Join the Community
              </Link>
            </div>
          </div>
        </section>

        {/* Two paths */}
        <section className="py-16 px-6 bg-white">
          <div className="max-w-5xl mx-auto">
            <h3 className="text-2xl font-bold text-[var(--color-primary)] text-center mb-3">
              Two ways to take part
            </h3>
            <p className="text-gray-600 text-center mb-12 max-w-2xl mx-auto">
              Open your home, or choose a table to join. Most weeks, that&apos;s all there is to it.
            </p>
            <div className="grid md:grid-cols-2 gap-6">
              <PathCard
                eyebrow="Hosting"
                title="Host a dinner"
                steps={hostSteps}
                footnote="Seats still open after Wednesday's deadline may be filled with members who asked to be matched. You'll see them on your guest list and in Thursday's group email."
                href="/host"
                cta="Host a dinner"
              />
              <PathCard
                eyebrow="Joining"
                title="Pick a dinner to join"
                steps={guestSteps}
                footnote="You'll get a heads-up if a dinner doesn't meet your kashrut or observance needs, and you can still choose to join."
                href="/browse"
                cta="Browse dinners"
              />
            </div>

            {/* Matching, secondary */}
            <div className="mt-6 rounded-xl border border-dashed border-[var(--color-primary)]/30 bg-[var(--color-warm)] p-6 md:flex md:items-center md:justify-between md:gap-6">
              <div>
                <h4 className="font-semibold text-[var(--color-primary)]">Don&apos;t mind where you go?</h4>
                <p className="text-gray-600 mt-1 text-sm">
                  Instead of picking, you can ask us to match you. On Thursday morning we place you
                  in a compatible dinner that still has open seats, based on kashrut, observance,
                  walking distance, and who you haven&apos;t met yet.
                </p>
              </div>
              <Link href="/join" className="btn-secondary text-sm whitespace-nowrap mt-4 md:mt-0 inline-block">
                Match me
              </Link>
            </div>
            <p className="text-xs text-gray-500 text-center mt-4">
              Buttons above take members straight to the app. New here? <Link href="/signup" className="underline">Sign up first</Link>.
            </p>
          </div>
        </section>

        {/* The week */}
        <section className="py-16 px-6">
          <div className="max-w-4xl mx-auto">
            <h3 className="text-2xl font-bold text-[var(--color-primary)] text-center mb-12">
              How a Week Works
            </h3>
            <div className="grid md:grid-cols-3 gap-8">
              {timeline.map((step, i) => (
                <div key={step.title} className="text-center">
                  <div className="w-16 h-16 bg-[var(--color-accent)] rounded-full flex items-center justify-center mx-auto mb-4">
                    <span className="text-2xl font-bold text-[var(--color-primary)]">{i + 1}</span>
                  </div>
                  <p className="text-xs uppercase tracking-wide text-gray-500 mb-1">{step.when}</p>
                  <h4 className="font-semibold text-lg mb-2">{step.title}</h4>
                  <p className="text-gray-600">{step.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Features */}
        <section className="py-16 px-6 bg-white">
          <div className="max-w-4xl mx-auto">
            <h3 className="text-2xl font-bold text-[var(--color-primary)] text-center mb-12">
              Built for Our Community
            </h3>
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
              {features.map((feature) => (
                <div key={feature.title} className="card">
                  <h4 className="font-semibold text-lg text-[var(--color-primary)] mb-2">{feature.title}</h4>
                  <p className="text-gray-600">{feature.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="bg-[var(--color-primary)] text-white py-8 px-6">
        <div className="max-w-4xl mx-auto text-center text-sm opacity-80">
          <p>Noe Valley Chavurah Shabbat Dinner Program</p>
          <p className="mt-1">Bringing our community together, one Friday at a time.</p>
        </div>
      </footer>
    </div>
  )
}

function PathCard({
  eyebrow,
  title,
  steps,
  footnote,
  href,
  cta,
}: {
  eyebrow: string
  title: string
  steps: string[]
  footnote: string
  href: string
  cta: string
}) {
  return (
    <div className="card flex flex-col border-t-4 !border-t-[var(--color-accent)]">
      <p className="text-xs uppercase tracking-wide text-gray-500 mb-1">{eyebrow}</p>
      <h4 className="text-xl font-bold text-[var(--color-primary)] mb-4">{title}</h4>
      <ol className="space-y-3 mb-4">
        {steps.map((step, i) => (
          <li key={i} className="flex gap-3 text-gray-700">
            <span className="flex-shrink-0 w-6 h-6 rounded-full bg-[var(--color-warm-dark)] text-[var(--color-primary)] text-sm font-semibold flex items-center justify-center">
              {i + 1}
            </span>
            <span>{step}</span>
          </li>
        ))}
      </ol>
      <p className="text-sm text-gray-500 mb-6">{footnote}</p>
      <Link href={href} className="btn-primary text-center mt-auto">
        {cta}
      </Link>
    </div>
  )
}
