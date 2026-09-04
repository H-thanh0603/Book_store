// Section 4: DEPARTMENT DISCOVERY — a single quiet row of category chips.
// The old 6-card grid duplicated the sticky department pills above while
// adding six unrelated accent hues; one navigation system is enough (critique
// P1: three parallel category systems → two).
import type { ComponentType } from "react";
import type { Department } from "./types";

export default function DepartmentCards({
  departments,
  onDepartment,
  activeDepartment,
}: {
  departments: Department[];
  onDepartment: (id: string) => void;
  activeDepartment: string;
}) {
  return (
    <section className="flex flex-wrap items-center gap-2">
      <span className="text-xs font-black uppercase tracking-widest text-[#8c2d19]">
        Khám phá phân khu:
      </span>
      {departments.slice(1).map((dept) => {
        const Icon: ComponentType<{ className?: string }> = dept.icon;
        const isActive = activeDepartment === dept.id;
        return (
          <button
            key={dept.id}
            onClick={() => onDepartment(dept.id)}
            aria-pressed={isActive}
            className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-bold transition-all cursor-pointer ${
              isActive
                ? "bg-[#1c1917] text-[#ffd56a] shadow-md"
                : "bg-white text-slate-700 hover:bg-[#faf4ea] hover:text-[#8c2d19] border border-[#ede5d8] shadow-xs"
            }`}
          >
            <Icon className="w-4 h-4" />
            <span>{dept.name}</span>
            <span className={`font-mono text-[11px] ${isActive ? "text-[#ffd56a]/80" : "text-slate-400"}`}>
              {dept.count}
            </span>
          </button>
        );
      })}
    </section>
  );
}
