type TrackingPayload = {
  id: string;
  latitude: number;
  longitude: number;
  eta_minutes: number;
  status: string;
};

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:8000";

async function getTracking(id: string): Promise<TrackingPayload | null> {
  const res = await fetch(`${API_BASE_URL}/api/eta/lookup/${id}`, { cache: "no-store" });
  if (!res.ok) {
    return null;
  }
  return (await res.json()) as TrackingPayload;
}

export default async function TrackingPage({ params }: { params: { id: string } }): Promise<React.JSX.Element> {
  const { id } = params;
  const payload = await getTracking(id);

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#f8fafc_0%,#e2e8f0_100%)] p-6 text-slate-900 md:p-10">
      <section className="mx-auto w-full max-w-3xl rounded-3xl border border-slate-200 bg-white p-6 shadow-xl md:p-8">
        <h1 className="text-3xl font-bold tracking-tight">Client Tracking</h1>
        <p className="mt-2 text-sm text-slate-600">Your electrician is on the way.</p>

        {!payload ? (
          <p className="mt-6 rounded-xl border border-rose-300 bg-rose-50 p-4 text-sm text-rose-700">
            Tracking link is invalid or expired.
          </p>
        ) : (
          <>
            <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-100 p-3">
              <div className="relative h-72 overflow-hidden rounded-xl bg-[radial-gradient(circle_at_30%_30%,#dbeafe_0%,#93c5fd_35%,#3b82f6_100%)]">
                <div className="absolute left-1/2 top-1/2 h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-rose-500 shadow-lg" />
                <p className="absolute bottom-3 left-3 rounded-md bg-white/85 px-2 py-1 text-xs font-medium text-slate-700">
                  Mock GPS: {payload.latitude.toFixed(4)}, {payload.longitude.toFixed(4)}
                </p>
              </div>
            </div>

            <div className="mt-4 grid gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm sm:grid-cols-2">
              <p>
                <span className="font-semibold">ETA:</span> {payload.eta_minutes} min
              </p>
              <p>
                <span className="font-semibold">Status:</span> {payload.status}
              </p>
            </div>
          </>
        )}
      </section>
    </main>
  );
}
