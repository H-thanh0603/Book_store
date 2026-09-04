import "dotenv/config";
import { prisma } from "../../src/lib/db";
import { isSealed, sealJson, sealSecret } from "../../src/lib/secret-box";

async function main() {
  const providers = await prisma.integrationProvider.findMany();
  for (const provider of providers) await prisma.integrationProvider.update({
    where: { id: provider.id },
    data: {
      credentials: provider.credentials == null || isSealed(provider.credentials)
        ? undefined : sealJson(provider.credentials),
      webhookSecret: provider.webhookSecret == null || isSealed(provider.webhookSecret)
        ? undefined : sealSecret(provider.webhookSecret),
    },
  });
  console.log(`Encrypted secrets for ${providers.length} integration provider(s)`);
  await prisma.$disconnect();
}

main().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exit(1);
});
