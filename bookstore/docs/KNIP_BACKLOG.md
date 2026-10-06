# Knip backlog

`npm run knip` chạy `knip --max-issues 40` — cơ chế ratchet: tổng số finding hiện tại là
40, mọi **finding mới** (export/file/dependency chết mới) sẽ làm script fail. Khi xử lý
xong một mục, giảm con số này trong `package.json` tương ứng. Đích đến cuối cùng là 0.

Trạng thái: 2026-10-07 (1 file + 24 exports + 15 types = 40).

## Unused file (1)

- `src/lib/support.ts` — rule-based support bot (`shouldEscalate`, `botReply`), chưa
  được nối vào widget/API nào. Có vẻ là feature stub — hoặc nối vào
  `src/app/support-widget.tsx` hoặc xóa.

## Unused exports (24)

| Symbol | Vị trí | Ghi chú |
|---|---|---|
| `RatingStars` | `src/app/shop/_components/CatalogSection.tsx` | |
| `CART_KEY` / `WISHLIST_KEY` | `src/app/shop/_components/data.ts` | Key bị nhân bản trong `toys/page.tsx`, `back-to-school/page.tsx` — nên gom về một nguồn |
| `default` | `src/components/BarcodeLabel.tsx` | Chỉ named export `printLabels` được dùng |
| `formatShortcut` | `src/hooks/useKeyboardShortcuts.ts` | |
| `newAgentKeyPlaintext`, `touchAgentKey`, `GENESIS_HASH`, `hashEventLink` | `src/lib/agent-auth.ts` | |
| `requireOrgActive` | `src/lib/auth.ts` | Comment trong file nói rõ chủ ý giữ lại — quyết định: wire hoặc xóa |
| `buildBillingVnpayUrl` | `src/lib/billing.ts` | |
| `refusedWrite` | `src/lib/commerce/merchant-backend.ts` | |
| `detectListingIssues`, `filterSlowMovers` (re-export) | `src/lib/commerce/merchant-backend.ts:115` | Test import từ `merchant-agent`, re-export này thừa |
| `stubReason` | `src/lib/commerce/storefront-backend.ts` | |
| `isBackendUnavailable` | `src/lib/commerce/types.ts` | |
| `embedTexts` | `src/lib/embeddings.ts` | |
| `buildOrgZip` | `src/lib/exports/misa-job.ts` | |
| `streamLlm` | `src/lib/llm.ts` | Streaming chat có vẻ đang dở dang |
| `toSuggestionRow` | `src/lib/merchant-agent.ts` | |
| `invalidateOrgReports` | `src/lib/reports.ts` | Có vẻ cần được gọi từ flow staged-changes/approvals |
| `STAGED_STATUS` | `src/lib/staged-changes.ts` | |
| `normalizeCatalogInput` | `src/lib/storefront.ts` | |
| `checkoutBusyError` | `src/lib/throttle.ts` | |

## Unused exported types (15)

`Variant`, `StoreOption`, `UseStorefront`, `PlanStepStatus`, `AgentTool`,
`RefusedWrite`, `ExportColumn`, `ConciergeIntent`, `LlmUsage`, `ChatMessage`,
`ReceiptLine`, `ReportType`, `ShippingZone`, `StagedStatus`, `TrackStage`.

Loại nhiều khả năng là API surface chủ ý cho client/consumer nội bộ — cân nhắc
un-export thay vì xóa nếu type vẫn dùng trong file.
