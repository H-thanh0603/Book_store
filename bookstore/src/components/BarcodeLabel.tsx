"use client";
import { useRef, useEffect } from "react";
import JsBarcode from "jsbarcode";

type Props = {
  barcode: string;
  name?: string;
  price?: number;
  width?: number;
  height?: number;
};

export default function BarcodeLabel({
  barcode,
  name,
  price,
  width = 2,
  height = 100,
}: Props) {
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (svgRef.current) {
      JsBarcode(svgRef.current, barcode, {
        format: barcode.length === 13 ? "EAN13" : barcode.length === 12 ? "UPC" : "CODE128",
        width,
        height,
        displayValue: true,
        fontSize: 12,
        margin: 4,
        textMargin: 2,
      });
    }
  }, [barcode, width, height]);

  return (
    <div className="inline-flex flex-col items-center bg-white border border-slate-200 rounded-lg p-2">
      <svg ref={svgRef} />
      {name && (
        <p className="text-[10px] text-slate-600 mt-1 text-center max-w-[160px] truncate">{name}</p>
      )}
      {price != null && price > 0 && (
        <p className="text-xs font-bold text-indigo-700">{price.toLocaleString("vi-VN")} ₫</p>
      )}
    </div>
  );
}

export type LabelData = {
  barcode: string;
  name: string;
  price: number;
  sku: string;
};

export function printLabels(labels: LabelData[], opts?: { copies?: number }) {
  const copies = opts?.copies ?? 1;
  const allLabels = labels.flatMap((l) => Array(copies).fill(l));

  const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>In tem barcode</title>
<script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.6/dist/JsBarcode.all.min.js"><\/script>
<style>
  @page { size: A4; margin: 10mm; }
  body { font-family: Arial, sans-serif; margin: 0; padding: 10mm; }
  .label-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 6mm;
  }
  .label {
    border: 1px solid #e2e8f0;
    border-radius: 6px;
    padding: 4mm;
    text-align: center;
    page-break-inside: avoid;
    background: white;
  }
  .label svg { max-width: 100%; }
  .label-name { font-size: 9px; color: #475569; margin-top: 2mm; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .label-price { font-size: 11px; font-weight: bold; color: #4f46e5; margin-top: 1mm; }
  .label-sku { font-size: 8px; color: #94a3b8; }
  @media print {
    body { padding: 0; }
  }
</style>
</head>
<body>
<div class="label-grid">
${allLabels
  .map(
    (l) => `
  <div class="label">
    <svg class="barcode" data-code="${l.barcode}"></svg>
    <div class="label-name">${l.name}</div>
    <div class="label-price">${l.price.toLocaleString("vi-VN")} ₫</div>
    <div class="label-sku">${l.sku}</div>
  </div>`
  )
  .join("\n")}
</div>
<script>
  JsBarcode(".barcode").init();
  document.querySelectorAll('.barcode').forEach(function(el) {
    var code = el.getAttribute('data-code');
    JsBarcode(el, code, {
      format: code.length === 13 ? 'EAN13' : code.length === 12 ? 'UPC' : 'CODE128',
      width: 1.5,
      height: 60,
      displayValue: true,
      fontSize: 10,
      margin: 2
    });
  });
  window.onload = function() { setTimeout(function() { window.print(); }, 500); };
<\/script>
</body>
</html>`;

  const win = window.open("", "_blank", "width=800,height=600");
  if (!win) return false;
  win.document.write(html);
  win.document.close();
  return true;
}
