// Indexable product page (B growth): server-rendered name, price,
// rating aggregate + JSON-LD Product schema so Google/social index it.
// The interactive shop stays client-side; this page is the SEO entry that
// links back to /shop?q= for purchase. ID-based (no slug migration).
import type { Metadata } from "next";
import Link from "next/link";
import { prismaRead } from "@/lib/db";

async function getProduct(id: string) {
  const product = await prismaRead.product.findFirst({
    where: { id, status: "active" },
    select: {
      id: true, name: true, description: true, imageUrl: true, updatedAt: true,
      category: { select: { name: true } },
      brand: { select: { name: true } },
      author: { select: { name: true } },
      publisher: { select: { name: true } },
      variants: {
        where: { active: true },
        select: {
          sku: true,
          prices: {
            where: { priceList: { kind: "retail" } },
            orderBy: { validFrom: "desc" }, take: 1,
            select: { amount: true },
          },
        },
      },
      reviews: { where: { status: "APPROVED" }, select: { rating: true } },
    },
  });
  return product;
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const p = await getProduct(id);
  if (!p) return { title: "Không tìm thấy sách" };
  const price = p.variants[0]?.prices[0] ? Number(p.variants[0].prices[0].amount) : null;
  const desc = p.description?.slice(0, 160) ?? `${p.name} — ${p.author?.name ?? p.brand?.name ?? "Melio Books"}.`;
  return {
    title: `${p.name} — ${p.author?.name ?? "Melio Books"}`,
    description: desc,
    openGraph: {
      title: p.name,
      description: desc,
      type: "website",
      ...(p.imageUrl ? { images: [{ url: p.imageUrl }] } : {}),
    },
    ...(price ? { other: { "product:price:amount": String(price), "product:price:currency": "VND" } } : {}),
  };
}

export default async function ProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const p = await getProduct(id);
  if (!p)
    return (
      <main className="max-w-2xl mx-auto p-8 text-center">
        <h1 className="font-serif text-2xl font-black">Không tìm thấy sách</h1>
        <Link href="/shop" className="text-[#8c2d19] font-bold text-sm underline">Về cửa hàng</Link>
      </main>
    );
  const price = p.variants[0]?.prices[0] ? Number(p.variants[0].prices[0].amount) : null;
  const ratings = p.reviews.map((r) => r.rating);
  const avg = ratings.length ? Math.round((ratings.reduce((s, r) => s + r, 0) / ratings.length) * 10) / 10 : null;
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: p.name,
    description: p.description?.slice(0, 300),
    ...(p.imageUrl ? { image: [p.imageUrl] } : {}),
    brand: p.brand?.name ?? p.publisher?.name,
    ...(avg ? { aggregateRating: { "@type": "AggregateRating", ratingValue: avg, reviewCount: ratings.length } } : {}),
    ...(price ? { offers: { "@type": "Offer", priceCurrency: "VND", price, availability: "https://schema.org/InStock" } } : {}),
  };
  // Escape `<` so a hostile product name/description can't break out of the script tag.
  const jsonLdText = JSON.stringify(jsonLd).replace(/</g, "\\u003c");
  return (
    <main className="max-w-2xl mx-auto p-6 sm:p-8 space-y-4 font-serif">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdText }} />
      <p className="text-[11px] uppercase tracking-widest text-[#8c2d19] font-bold">{p.category.name}</p>
      <h1 className="text-3xl font-black text-slate-900">{p.name}</h1>
      <p className="text-sm text-slate-500 italic">
        {[p.author?.name && `✍️ ${p.author.name}`, p.publisher?.name && `🏢 ${p.publisher.name}`].filter(Boolean).join(" · ") || "Melio Books"}
      </p>
      {avg && <p className="text-sm">⭐ <b>{avg}</b> <span className="text-slate-400">({ratings.length} đánh giá)</span></p>}
      {price !== null && <p className="text-2xl font-black">{price.toLocaleString("vi-VN")} ₫</p>}
      {p.description && <p className="text-sm text-slate-600 leading-relaxed">{p.description}</p>}
      <div className="flex gap-2 pt-2">
        <Link
          href={`/shop?q=${encodeURIComponent(p.name)}`}
          className="px-5 py-3 rounded-2xl bg-[#1c1917] hover:bg-[#8c2d19] text-white text-sm font-bold"
        >
          Mua ngay tại cửa hàng
        </Link>
        <Link href="/shop" className="px-5 py-3 rounded-2xl border border-[#ede5d8] text-sm font-bold text-slate-700">
          Duyệt thêm
        </Link>
      </div>
    </main>
  );
}
