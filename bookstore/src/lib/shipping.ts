import { getSystemConfig } from "./api";

// N3b: zone-based delivery fees. Zones live in SystemConfig so ops can edit
// them without a deploy (settings UI or direct DB row):
//   shipping.zones = [{ "match": "hồ chí minh", "fee": 15000, "label": "Nội thành HCM" }, ...]
//   shipping.defaultFee = 30000, shipping.freeThreshold = 250000
// Match = case-insensitive substring on the delivery address, first hit wins.

export type ShippingZone = { match: string; fee: number; label: string };

export type ShippingQuote = { zone: string; fee: bigint; freeShip: boolean };

function norm(s: string): string {
  return s.toLowerCase().normalize("NFC").trim();
}

export async function quoteShipping(input: {
  address?: string | null;
  subtotal: bigint;
}): Promise<ShippingQuote> {
  const [zones, defaultFee, freeThreshold] = await Promise.all([
    getSystemConfig<ShippingZone[]>("shipping.zones", []),
    getSystemConfig<number>("shipping.defaultFee", 30000),
    getSystemConfig<number>("shipping.freeThreshold", 250000),
  ]);
  if (input.subtotal >= BigInt(freeThreshold))
    return { zone: "FREESHIP", fee: 0n, freeShip: true };
  const addr = norm(input.address ?? "");
  const hit = zones.find((z) => z.match && addr.includes(norm(z.match)));
  if (hit) return { zone: hit.label || hit.match, fee: BigInt(Math.max(0, Math.floor(hit.fee))), freeShip: false };
  return { zone: "DEFAULT", fee: BigInt(Math.max(0, Math.floor(defaultFee))), freeShip: false };
}
