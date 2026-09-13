"use client";

/** Skip link for keyboard users: jumps focus to the page's <main> landmark.
 *  Pages don't share a main id, so the target is resolved at activate time. */
export default function SkipLink() {
  function jump(e: React.MouseEvent | React.KeyboardEvent) {
    e.preventDefault();
    const main = document.querySelector("main");
    if (!main) return;
    if (!main.hasAttribute("tabindex")) main.setAttribute("tabindex", "-1");
    (main as HTMLElement).focus({ preventScroll: false });
  }

  return (
    <a
      href="#main-content"
      onClick={jump}
      className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-[100] focus:bg-[#8c2d19] focus:text-white focus:px-4 focus:py-2 focus:rounded-lg focus:text-sm focus:font-semibold"
    >
      Bỏ qua tới nội dung chính
    </a>
  );
}
