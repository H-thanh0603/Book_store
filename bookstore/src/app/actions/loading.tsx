// Action Center loading state.
export default function Loading() {
  return (
    <main className="min-h-screen bg-slate-50/60 pb-16" aria-busy="true" aria-label="Đang tải">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 pt-8 space-y-6 animate-pulse">
        <div className="h-6 w-1/3 rounded bg-slate-200" />
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-24 rounded-2xl bg-white border border-slate-200" />
        ))}
      </div>
    </main>
  );
}
