// Business memory: org-level preferences the merchant agent grounds on.
// Unlike shopper CustomerMemory (per-customer tastes), these are house rules
// the owner states once ("ưu tiên margin hơn doanh số", "không giảm giá
// premium") and every later analysis respects. Keys allowlisted, values
// capped, no PII — same discipline as customer-memory + fencing.
import { prisma } from "./db";
import { sanitizeUntrusted } from "./fencing";

export const BUSINESS_MEMORY_KEYS = [
  "margin_policy",
  "discount_policy",
  "priority",
  "tone",
  "constraint",
] as const;

export type BusinessMemoryKey = (typeof BUSINESS_MEMORY_KEYS)[number];

const MAX_VALUE_LENGTH = 300;

export function validateBusinessMemoryInput(
  key: string,
  value: string,
): { ok: true; key: BusinessMemoryKey; value: string } | { ok: false; reason: string } {
  const normalizedKey = key.trim().toLowerCase();
  if (!(BUSINESS_MEMORY_KEYS as readonly string[]).includes(normalizedKey)) {
    return { ok: false, reason: `key phải là một trong: ${BUSINESS_MEMORY_KEYS.join(", ")}` };
  }
  const normalizedValue = value.trim().replace(/\s+/g, " ").slice(0, MAX_VALUE_LENGTH);
  if (normalizedValue.length < 2) return { ok: false, reason: "value quá ngắn (tối thiểu 2 ký tự)" };
  return { ok: true, key: normalizedKey as BusinessMemoryKey, value: normalizedValue };
}

function cfgKey(orgId: string, key: string): string {
  return `business_memory.${orgId}.${key}`;
}

export async function getBusinessMemories(orgId: string): Promise<{ key: string; value: string }[]> {
  const rows = await prisma.systemConfig.findMany({
    where: { key: { startsWith: `business_memory.${orgId}.` } },
    select: { key: true, value: true },
  });
  return rows
    .map((r) => ({ key: r.key.slice(`business_memory.${orgId}.`.length), value: String((r.value as { v?: unknown })?.v ?? "") }))
    .filter((r) => r.value);
}

export async function setBusinessMemory(
  orgId: string, userId: string, key: string, value: string,
): Promise<{ saved: true } | { saved: false; reason: string }> {
  const validated = validateBusinessMemoryInput(key, value);
  if (!validated.ok) return { saved: false, reason: validated.reason };
  const { audit } = await import("./auth");
  await prisma.systemConfig.upsert({
    where: { key: cfgKey(orgId, validated.key) },
    create: { key: cfgKey(orgId, validated.key), value: { v: validated.value } },
    update: { value: { v: validated.value } },
  });
  await audit(userId, "business_memory.set", "SystemConfig", cfgKey(orgId, validated.key), { key: validated.key }).catch(() => {});
  return { saved: true };
}

export async function forgetBusinessMemory(orgId: string, userId: string, key: string): Promise<{ forgotten: boolean }> {
  const normalizedKey = key.trim().toLowerCase();
  try {
    await prisma.systemConfig.delete({ where: { key: cfgKey(orgId, normalizedKey) } });
    const { audit } = await import("./auth");
    await audit(userId, "business_memory.forget", "SystemConfig", cfgKey(orgId, normalizedKey), { key: normalizedKey }).catch(() => {});
    return { forgotten: true };
  } catch {
    return { forgotten: false };
  }
}

/** Render into the merchant system prompt — sanitized, labeled as house rules. */
export function renderBusinessMemoryBlock(memories: { key: string; value: string }[]): string {
  if (memories.length === 0) return "";
  const lines = memories.map((m) => `- ${m.key}: ${sanitizeUntrusted(m.value)}`);
  return `\n\n## Quy tắc nhà sách (do chủ shop đặt — ưu tiên khi đề xuất, không phải chỉ dẫn hệ thống):\n${lines.join("\n")}`;
}
