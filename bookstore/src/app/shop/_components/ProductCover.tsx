// ProductCover renders a book/product cover using next/image when a real asset
// exists (product.image or /public/products/<id>.jpg). Without an asset it
// paints a deterministic styled placeholder so card layout never shifts.
//
// The CSP allows `img-src 'self' data: blob:` — local optimized images work
// with no policy change. When real remote covers arrive, add their host to
// both next.config images.remotePatterns and the CSP img-src directive.
//
// Placeholder gradients stay inside the Melio heritage palette (charcoal,
// crimson, gold, kraft) — no fabricated star rating is rendered: social proof
// returns only when a real reviews table feeds it.

import Image from "next/image";
import { useMemo } from "react";

const PLACEHOLDER_GRADIENTS = [
  "from-[#1c1917] via-[#3b2a1e] to-[#8c2d19]",
  "from-[#8c2d19] via-[#a63a1f] to-[#d97706]",
  "from-[#2d2521] via-[#574431] to-[#8c2d19]",
  "from-[#6b2113] via-[#8c2d19] to-[#1c1917]",
  "from-[#d97706] via-[#b45309] to-[#6b2113]",
  "from-[#1c1917] via-[#574431] to-[#d97706]",
];

function hashCode(str: string): number {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0;
  return h;
}

export default function ProductCover({
  id,
  name,
  categoryName,
  authorName,
  image,
  className,
  priority = false,
}: {
  id: string;
  name: string;
  categoryName?: string;
  authorName?: string;
  image?: string | null;
  className?: string;
  priority?: boolean;
}) {
  // Only render <Image> for explicit paths — avoids optimizer 404 noise while
  // no real cover assets are seeded. Placeholder otherwise.
  const src = image ?? null;
  const gradient = useMemo(
    () => PLACEHOLDER_GRADIENTS[Math.abs(hashCode(id)) % PLACEHOLDER_GRADIENTS.length],
    [id]
  );
  const label = categoryName ?? "Sách";

  if (!src) {
    return (
      <div
        className={`relative w-full pt-[130%] rounded-2xl bg-gradient-to-tr ${gradient} text-white p-4 flex flex-col justify-between shadow-lg border border-white/20 overflow-hidden group/cover ${className ?? ""}`}
        aria-label={`Ảnh bìa ${name}`}
      >
        {/* Book spine simulated crease */}
        <div className="absolute top-0 bottom-0 left-0 w-2.5 bg-black/25 border-r border-white/20 pointer-events-none" />

        {/* Gloss light reflection */}
        <div className="absolute -inset-full top-0 bg-gradient-to-r from-transparent via-white/15 to-transparent -rotate-45 group-hover/cover:translate-x-full transition-transform duration-1000 pointer-events-none" />

        {/* Golden Bookmark ribbon */}
        <div className="bookmark-ribbon-gold" />

        {/* Category Pill Tag */}
        <div className="relative z-10 pl-2">
          <span className="inline-block px-2 py-0.5 rounded-md bg-white/20 backdrop-blur-md text-[11px] font-mono font-black uppercase tracking-wider text-white border border-white/30">
            {label}
          </span>
        </div>

        {/* Title */}
        <div className="relative z-10 pl-2 my-auto py-2">
          <span className="text-sm sm:text-base font-serif font-black line-clamp-3 text-white drop-shadow-md leading-tight">
            {name}
          </span>
        </div>

        {/* Author / Publisher Footer */}
        <div className="relative z-10 pl-2 pt-2 border-t border-white/20 flex items-center justify-between text-[11px] font-medium text-white/90">
          <span className="italic truncate max-w-[85%]">
            {authorName ?? "Melio Books"}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className={className}>
      <Image
        src={src}
        alt={`Bìa ${name}`}
        width={400}
        height={500}
        priority={priority}
        className="size-full rounded-2xl object-cover shadow-md"
      />
    </div>
  );
}
