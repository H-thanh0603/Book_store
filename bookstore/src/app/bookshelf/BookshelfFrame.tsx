"use client";

// Iframe wrapper around the canonical ThreeUI bookshelf HTML.
// Source bundle lives at /bookshelf.html (served from `public/`).
// Geometry, color palette, and seeds are preserved verbatim from the
// ThreeUI source (SHA-256 606f200fed86); only the BOOKS[] text fields
// have been overridden for the bookstore thesis showcase.
//
// Route-scoped CSP allowing `unsafe-eval` + `unpkg.com` is configured
// in next.config.ts so Three.js r165 can load and execute inside this
// iframe without breaking the rest of the app's strict CSP.

export default function BookshelfFrame() {
  return (
    <div className="min-h-screen w-full bg-[#171a24]">
      <iframe
        src="/bookshelf.html"
        title="Bookshelf — Seven Volumes of the Western Canon"
        loading="eager"
        sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
        className="block h-screen w-full border-0"
      />
    </div>
  );
}