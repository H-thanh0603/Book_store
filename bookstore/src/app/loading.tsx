// Root loading state (WS2.3): skeleton instead of a white flash on F5.
export default function Loading() {
  return (
    <main className="min-h-screen bg-slate-50/60 pb-16" aria-busy="true" aria-label="Đang tải">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-8 space-y-6 animate-pulse">
        <div className="bg-white p-6 rounded-2xl border border-slate-200/80 space-y-3">
          <div className="h-6 w-1/3 rounded bg-slate-200" />
          <div className="h-3 w-1/2 rounded bg-slate-100" />
        </div>
        <div className="bg-white rounded-2xl border border-slate-200/80 p-4 space-y-3">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-10 rounded-xl bg-slate-100" />
          ))}
        </div>
      </div>
    </main>
  );
}
