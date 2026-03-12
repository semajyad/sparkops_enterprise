export default function AdminLoading(): React.JSX.Element {
  return (
    <main className="min-h-screen p-4 pb-24 bg-gray-50 sm:p-6 md:p-8">
      <section className="mx-auto w-full max-w-4xl space-y-4">
        <div className="h-8 w-40 animate-pulse rounded-lg bg-gray-200" />
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <div className="h-[220px] animate-pulse rounded-2xl bg-gray-200" />
          <div className="h-[220px] animate-pulse rounded-2xl bg-gray-200" />
        </div>
      </section>
    </main>
  );
}
