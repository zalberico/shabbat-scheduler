import Link from 'next/link'

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

      {/* Hero */}
      <main className="flex-1">
        <section className="py-20 px-6">
          <div className="max-w-3xl mx-auto text-center">
            <h2 className="text-4xl md:text-5xl font-bold text-[var(--color-primary)] mb-6">
              Shabbat Dinners,<br />Made Simple
            </h2>
            <p className="text-lg text-gray-600 mb-8 max-w-2xl mx-auto">
              The Noe Valley Chavurah dinner coordination app. Hosts offer seats,
              guests sign up, and we match everyone for a warm Friday night meal.
            </p>
            <div className="flex justify-center">
              <Link href="/signup" className="btn-primary text-lg px-8 py-3">
                Join the Community
              </Link>
            </div>
          </div>
        </section>

        {/* How it works */}
        <section className="py-16 px-6 bg-white">
          <div className="max-w-4xl mx-auto">
            <h3 className="text-2xl font-bold text-[var(--color-primary)] text-center mb-12">
              How It Works
            </h3>
            <div className="grid md:grid-cols-3 gap-8">
              <div className="text-center">
                <div className="w-16 h-16 bg-[var(--color-accent)] rounded-full flex items-center justify-center mx-auto mb-4">
                  <span className="text-2xl font-bold text-[var(--color-primary)]">1</span>
                </div>
                <h4 className="font-semibold text-lg mb-2">Sign Up by Wednesday</h4>
                <p className="text-gray-600">
                  Hosts offer their table with seats, kashrut, and observance level.
                  Guests sign up with their party size and preferences.
                </p>
              </div>
              <div className="text-center">
                <div className="w-16 h-16 bg-[var(--color-accent)] rounded-full flex items-center justify-center mx-auto mb-4">
                  <span className="text-2xl font-bold text-[var(--color-primary)]">2</span>
                </div>
                <h4 className="font-semibold text-lg mb-2">Thursday Matching</h4>
                <p className="text-gray-600">
                  Our algorithm matches guests to compatible hosts, respecting kashrut,
                  observance, and walking distance for Shomer Shabbat guests.
                </p>
              </div>
              <div className="text-center">
                <div className="w-16 h-16 bg-[var(--color-accent)] rounded-full flex items-center justify-center mx-auto mb-4">
                  <span className="text-2xl font-bold text-[var(--color-primary)]">3</span>
                </div>
                <h4 className="font-semibold text-lg mb-2">Friday Dinner</h4>
                <p className="text-gray-600">
                  Everyone gets an email introduction. The host shares their address
                  and you enjoy a beautiful Shabbat meal together.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Features */}
        <section className="py-16 px-6">
          <div className="max-w-4xl mx-auto">
            <h3 className="text-2xl font-bold text-[var(--color-primary)] text-center mb-12">
              Built for Our Community
            </h3>
            <div className="grid md:grid-cols-2 gap-6">
              {[
                { title: 'Kashrut Levels', desc: 'From flexible to glatt kosher — the system matches guests with compatible hosts.' },
                { title: 'Observance Levels', desc: 'Hosts set their dinner observance level and guests set their minimum — matching respects both.' },
                { title: 'Walking Distance', desc: 'Guests who walk on Shabbat can share their address and get matched to nearby hosts.' },
                { title: 'Dietary Needs', desc: 'Vegetarian, vegan, gluten-free, nut allergy — all tracked and communicated to hosts.' },
                { title: 'Meet New People', desc: 'The algorithm favors new pairings so you meet different community members each week.' },
              ].map((feature) => (
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
