#!/usr/bin/env python3
"""Scrape real Vietnamese book products from Tiki's public API into var/tiki_books.json.

Only writes a JSON file — import into the bookstore DB is scripts/import-tiki.ts.
Idempotent by product id: re-running skips ids already in the output file.

ponytail: list API gives no author/ISBN — one detail call per product.
If Tiki rate-limits, raise SLEEP or lower PAGE limit.
"""
import json, os, sys, time, urllib.request

BASE = "https://tiki.vn/api/v2/products"
UA = {"User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36",
      "Accept": "application/json"}
OUT = os.path.join(os.path.dirname(__file__), "..", "var", "tiki_books.json")
CATEGORY = 316  # Sách tiếng Việt
PAGES = int(sys.argv[1]) if len(sys.argv) > 1 else 8
SLEEP = 0.4

def fetch(url):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=15) as r:
        return json.load(r)

def main():
    done = {}
    if os.path.exists(OUT):
        with open(OUT) as f:
            done = {p["id"]: p for p in json.load(f)}
    print(f"already scraped: {len(done)}")

    items = []
    for page in range(1, PAGES + 1):
        d = fetch(f"{BASE}?limit=50&page={page}&category={CATEGORY}&aggregations=1")
        batch = d.get("data") or []
        print(f"page {page}: {len(batch)} items")
        if not batch:
            break
        items.extend(batch)
        time.sleep(SLEEP)

    out = []
    detail_ok = detail_fail = 0
    for it in items:
        pid = it["id"]
        if pid in done:
            out.append(done[pid])
            continue
        try:
            det = fetch(f"{BASE}/{pid}")
            time.sleep(SLEEP)
        except Exception as e:
            detail_fail += 1
            continue
        specs = {}
        for grp in det.get("specifications") or []:
            for a in grp.get("attributes") or []:
                specs[a.get("name", "")] = a.get("value", "")
        authors = ", ".join(a["name"] for a in det.get("authors") or [])
        pub = specs.get("Nhà xuất bản") or specs.get("Công ty phát hành") or ""
        # ISBN lives under "Mã hàng" / "ISBN" spec or none; fall back to Tiki sku.
        isbn = specs.get("ISBN") or specs.get("Mã hàng") or it.get("sku") or str(pid)
        out.append({
            "id": pid,
            "name": det.get("name") or it["name"],
            "price": det.get("price") or it.get("price") or 0,
            "image": det.get("thumbnail_url") or it.get("thumbnail_url") or "",
            "authors": authors,
            "publisher": pub,
            "pages": specs.get("Số trang", ""),
            "cover": specs.get("Loại bìa", ""),
            "isbn": str(isbn),
            "category": det.get("primary_category_name") or "Sách",
            "quantity_sold": (det.get("quantity_sold") or {}).get("value", 0),
            "url": f"https://tiki.vn/{det.get('url_key', '')}-p{pid}.html",
        })
        detail_ok += 1

    print(f"detail ok: {detail_ok}, fail: {detail_fail}")
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w") as f:
        json.dump(out, f, ensure_ascii=False, indent=1)
    print(f"wrote {len(out)} -> {os.path.abspath(OUT)}")

if __name__ == "__main__":
    main()
