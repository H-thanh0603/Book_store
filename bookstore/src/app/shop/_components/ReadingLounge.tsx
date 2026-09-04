// Section 6: READING LOUNGE BY ATMOSPHERE & MOOD
import type { Product, ReadingAtmosphere } from "./types";
import ProductCover from "./ProductCover";

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
    <section className="rounded-3xl bg-white p-6 sm:p-10 border border-slate-200/80 shadow-xs space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200/80 pb-5">
        <div>
          <span className="text-[10px] uppercase tracking-widest text-[#8c2d19] font-black">
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
              className={`px-4 py-2 rounded-2xl text-xs font-bold whitespace-nowrap transition-all flex items-center gap-1.5 cursor-pointer ${
                activeMood === m.id
                  ? "bg-[#1c1917] text-[#ffd56a] shadow-md font-black scale-105"
                  : "bg-slate-100 text-slate-700 hover:bg-slate-200"
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
              className="p-4 rounded-3xl bg-white border border-slate-200/80 hover:shadow-xl hover:-translate-y-1.5 transition-all duration-200 cursor-pointer group flex flex-col justify-between"
            >
              <div className="mb-3">
                <ProductCover
                  id={p.id}
                  name={p.name}
                  categoryName={p.category.name}
                  authorName={p.author?.name}
                  image={p.image ?? null}
                />
              </div>
              <div className="space-y-1">
                <h5 className="font-bold text-xs sm:text-sm text-slate-900 line-clamp-1 group-hover:text-[#8c2d19] transition-colors">
                  {p.name}
                </h5>
                <b className="text-sm font-black text-slate-900 block">
                  {variant ? money(variant.price) : "Liên hệ"}
                </b>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

