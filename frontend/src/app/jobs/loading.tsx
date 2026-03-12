export default function JobsLoading(): React.JSX.Element {
  return (
    <main className="min-h-screen p-4 pb-24 bg-gray-50 sm:p-6 md:p-10">
      <section className="mx-auto w-full max-w-4xl rounded-3xl border border-gray-200 bg-gray-50 p-6 shadow-sm md:p-8">
        <div className="h-10 w-full animate-pulse rounded-xl bg-gray-200" />
        <div className="mt-4 flex gap-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-9 w-24 animate-pulse rounded-full bg-gray-200" />
          ))}
        </div>
        <div className="mt-4 space-y-3">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="h-16 animate-pulse rounded-xl bg-gray-200" />
          ))}
        </div>
      </section>
    </main>
  );
}
