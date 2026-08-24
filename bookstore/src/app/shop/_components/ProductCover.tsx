// ProductCover renders a book/product cover using next/image when a real asset
// exists (product.image or /public/products/<id>.jpg). Without an asset it
// paints a deterministic styled placeholder so card layout never shifts.
//
// The CSP allows `img-src 'self' data: blob:` — local optimized images work
// with no policy change. When real remote covers arrive, add their host to
// both next.config images.remotePatterns and the CSP img-src directive.

import Image from "next/image";
import { useMemo } from "react";

const PLACEHOLDER_GRADIENTS = [
  "from-[#1c1917] via-[#2d2521] to-[#171412]",
  "from-emerald-900 via-teal-900 to-cyan-950",
  "from-rose-900 via-pink-900 to-amber-950",
  "from-amber-900 via-orange-900 to-red-950",
  "from-indigo-900 via-slate-900 to-gray-950",
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
  const label = categoryName ?? "Sản phẩm";

  if (!src) {
    return (
      <div
        className={`relative w-full pt-[125%] rounded-2xl bg-gradient-to-tr ${gradient} text-white p-4 flex flex-col justify-between shadow-md border border-white/10 overflow-hidden ${className ?? ""}`}
        aria-label={`Ảnh bìa ${name}`}
      >
        <div className="bookmark-ribbon" />
        <span className="text-[8px] font-mono text-amber-300 uppercase">{label.slice(0, 4)}</span>
        <span className="text-sm font-serif font-black line-clamp-3 text-amber-100 my-auto py-2">{name}</span>
        <span className="text-[9px] italic text-white/70 line-clamp-1">✍️ {authorName ?? "Melio Books"}</span>
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
