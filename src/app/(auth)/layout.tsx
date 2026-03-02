export default function AuthLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <h1 className="text-2xl font-bold text-[var(--color-primary)] text-center mb-8">
          Shabbat Scheduler
        </h1>
        {children}
      </div>
    </div>
  )
}
