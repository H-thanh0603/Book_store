// Section 4: DEPARTMENT DISCOVERY CARDS
import type { ComponentType } from "react";
import type { Department } from "./types";

export default function DepartmentCards({
  departments,
  onDepartment,
}: {
  departments: Department[];
  onDepartment: (id: string) => void;
}) {
  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between border-b border-[#ede5d8] pb-3">
        <div>
          <span className="text-[10px] font-serif uppercase tracking-widest text-[#8c2d19] font-bold">
            KHÁM PHÁ CÁC NGÀNH HÀNG
          </span>
          <h2 className="font-serif font-black text-2xl text-slate-900 mt-0.5">
            Các Phân Khu Trưng Bày Tiêu Điểm
          </h2>
        </div>
        <span className="text-xs text-slate-500 font-serif italic">Hơn 5.000+ sản phẩm có sẵn</span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {departments.slice(1).map((dept) => {
          const Icon: ComponentType<{ className?: string }> = dept.icon;
          return (
            <button
              key={dept.id}
              onClick={() => {
                onDepartment(dept.id);
                document.querySelector("#catalog")?.scrollIntoView({ behavior: "smooth" });
              }}
              className="p-4 rounded-3xl bg-white paper-card hover:shadow-xl hover:-translate-y-1 transition-all text-center flex flex-col items-center justify-between min-h-36 group"
            >
              <div className="size-14 rounded-2xl bg-[#faf4ea] text-[#8c2d19] flex items-center justify-center border border-[#e8dac5] group-hover:scale-110 group-hover:bg-[#1c1917] group-hover:text-white transition-all">
                <Icon className="w-7 h-7" />
              </div>
              <div>
                <h4 className="font-serif font-black text-xs sm:text-sm text-slate-900 group-hover:text-[#8c2d19] transition-colors mt-2">
                  {dept.name}
                </h4>
                <span className="text-[10px] text-slate-400 font-serif block">{dept.count}</span>
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}
