// Rotate INTEGRATION_ENCRYPTION_KEY: re-seal every provider secret under the
// new key. Run with BOTH keys set:
//   OLD_INTEGRATION_ENCRYPTION_KEY=<old> INTEGRATION_ENCRYPTION_KEY=<new> \
//     npx tsx scripts/rotate-integration-key.ts
import "dotenv/config";
import { prisma } from "../src/lib/db";
import { isSealed, openSecret, sealJson, sealSecret } from "../src/lib/secret-box";

async function main() {
  const oldKey = process.env.OLD_INTEGRATION_ENCRYPTION_KEY;
  const newKey = process.env.INTEGRATION_ENCRYPTION_KEY;
  if (!oldKey) throw new Error("OLD_INTEGRATION_ENCRYPTION_KEY (the current key) is required");
  if (!newKey) throw new Error("INTEGRATION_ENCRYPTION_KEY (the NEW key) is required");
  if (oldKey === newKey) throw new Error("OLD and NEW keys are identical — nothing to rotate");
  if (Buffer.from(newKey, "base64").length !== 32)
    throw new Error("NEW INTEGRATION_ENCRYPTION_KEY must be a base64-encoded 32-byte key");

  let rotated = 0;
  const providers = await prisma.integrationProvider.findMany();
  for (const provider of providers) {
    const updates: Record<string, unknown> = {};
    for (const field of ["credentials", "webhookSecret"] as const) {
      const value = provider[field];
      if (value == null) continue;
      if (!isSealed(value))
        throw new Error(`Provider ${provider.name}: ${field} is plaintext — run security:encrypt-integrations first`);
      // secret-box reads INTEGRATION_ENCRYPTION_KEY; point it at the old key to
      // open, then back at the new key to reseal.
      process.env.INTEGRATION_ENCRYPTION_KEY = oldKey;
      let plaintext: string;
      try {
        plaintext = openSecret(value);
      } catch {
        throw new Error(`Provider ${provider.name}: ${field} cannot be decrypted with OLD key — wrong key or corrupted seal`);
      }
      process.env.INTEGRATION_ENCRYPTION_KEY = newKey;
      updates[field] = field === "credentials" ? sealJson(JSON.parse(plaintext)) : sealSecret(plaintext);
    }
    if (Object.keys(updates).length > 0) {
      await prisma.integrationProvider.update({ where: { id: provider.id }, data: updates });
      rotated++;
    }
  }
  console.log(`Rotated secrets for ${rotated}/${providers.length} provider(s). Update INTEGRATION_ENCRYPTION_KEY in your process manager/secret store NOW, then restart.`);
  await prisma.$disconnect();
}

main().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exit(1);
});
