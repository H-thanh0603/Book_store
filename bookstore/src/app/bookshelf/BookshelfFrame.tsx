"use client";

import Nav from "../nav";

// Iframe wrapper around the canonical ThreeUI bookshelf HTML.
// Source bundle lives at /bookshelf.html (served from `public/`).
// Geometry, color palette, and seeds are preserved verbatim from the
// ThreeUI source (SHA-256 606f200fed86); only the BOOKS[] text fields
// have been overridden for the bookstore thesis showcase.
//
// Route-scoped CSP allowing `unsafe-eval` + jsdelivr is configured
// in next.config.ts so Three.js r165 can load and execute inside this
// iframe without breaking the rest of the app's strict CSP.

export default function BookshelfFrame() {
  return (
    <main className="min-h-screen bg-[#faf7f2] pb-8">
      <Nav />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6">
        <h1 className="text-xl font-bold text-[#1c1917] tracking-tight">
          Bookshelf 3D — Bảy Kiệt Tác Văn Học
        </h1>
        <p className="text-xs text-[#574431] mt-0.5">
          Showcase Three.js tương tác: Don Quixote, War and Peace, Hamlet, The Odyssey, One Hundred
          Years of Solitude, Crime and Punishment, In Search of Lost Time
        </p>
        <div className="mt-4 rounded-2xl overflow-hidden border border-[#ede5d8] bg-[#171a24] shadow-md">
          <iframe
            src="/bookshelf.html"
            title="Bookshelf — Seven Volumes of the Western Canon"
            loading="eager"
            sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
            className="block h-[calc(100dvh-13rem)] min-h-[520px] w-full border-0"
          />
        </div>
      </div>
    </main>
  );
}
