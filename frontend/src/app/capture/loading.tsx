export default function CaptureLoading(): React.JSX.Element {
  return (
    <main className="min-h-screen p-4 pb-24 bg-gray-50 sm:p-6">
      <section className="mx-auto w-full max-w-2xl space-y-4">
        <div className="h-12 w-48 animate-pulse rounded-xl bg-gray-200" />
        <div className="h-40 animate-pulse rounded-2xl bg-gray-200" />
        <div className="h-14 animate-pulse rounded-xl bg-gray-200" />
        <div className="h-32 animate-pulse rounded-2xl bg-gray-200" />
      </section>
    </main>
  );
}
