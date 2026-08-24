// Section 6: READING LOUNGE BY ATMOSPHERE & MOOD
import type { Product, ReadingAtmosphere } from "./types";

export default function ReadingLounge({
  atmospheres,
  activeMood,
  onMood,
  products,
  money,
  onQuickView,
}: {
  atmospheres: ReadingAtmosphere[];
  activeMood: string;
  onMood: (id: string) => void;
  products: Product[];
  money: (v: number) => string;
  onQuickView: (p: Product) => void;
}) {
  return (
    <section className="rounded-3xl bg-white p-6 sm:p-10 paper-card shadow-xs space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#ede5d8] pb-5">
        <div>
          <span className="text-[10px] font-serif uppercase tracking-widest text-[#8c2d19] font-bold">
            KHÔNG GIAN ĐỌC CẢM XÚC
          </span>
          <h2 className="font-serif font-black text-2xl sm:text-3xl text-slate-900 mt-0.5">
            Tủ Sách Theo Trạng Thái &amp; Không Gian
          </h2>
        </div>

        {/* Mood selector buttons */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 max-w-xl">
          {atmospheres.map((m) => (
            <button
              key={m.id}
              onClick={() => onMood(m.id)}
              className={`px-4 py-2 rounded-2xl text-xs font-serif font-bold whitespace-nowrap transition-all flex items-center gap-1.5 ${
                activeMood === m.id
                  ? "bg-[#1c1917] text-white shadow-md"
                  : "bg-[#faf7f2] border border-[#ede5d8] text-slate-700 hover:bg-white"
              }`}
            >
              <span>{m.icon}</span>
              <span>{m.title}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {products.map((p) => {
          const variant = p.variants[0];
          return (
            <div
              key={p.id}
              onClick={() => onQuickView(p)}
              className="p-4 rounded-2xl bg-[#faf8f5] border border-[#ede5d8] hover:bg-white hover:shadow-xl transition-all cursor-pointer group flex flex-col justify-between"
            >
              <div className="aspect-[4/5] rounded-xl bg-[#1c1917] text-white p-3 flex flex-col justify-between mb-3 shadow-md">
                <span className="text-[9px] font-serif uppercase text-amber-300">{p.category.name}</span>
                <h4 className="font-serif font-black text-xs sm:text-sm line-clamp-3 text-amber-100">{p.name}</h4>
                <span className="text-[9px] font-serif italic text-slate-400">✍️ {p.author?.name ?? "Melio"}</span>
              </div>
              <div>
                <h5 className="font-serif font-bold text-xs text-slate-900 line-clamp-1 group-hover:text-[#8c2d19]">{p.name}</h5>
                <b className="font-serif text-sm font-black text-[#1c1917] mt-1 block">{variant ? money(variant.price) : "Liên hệ"}</b>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
