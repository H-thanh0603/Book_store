// Provisions a dedicated staff account for the auth e2e specs. Runs before
// the webServer boots (see playwright.config.ts); the specs read the same
// deterministic values from e2e/credentials.ts.
import "dotenv/config";
import { prisma } from "../src/lib/db";
import { hashPassword } from "../src/lib/auth";
import { E2E_STAFF_EMAIL, E2E_STAFF_PASSWORD } from "./credentials";

export default async function provision() {
  const org = await prisma.organization.findFirstOrThrow();
  const role = await prisma.role.findUniqueOrThrow({ where: { name: "owner" } });

  const user = await prisma.user.upsert({
    where: { email: E2E_STAFF_EMAIL },
    create: { email: E2E_STAFF_EMAIL, passwordHash: hashPassword(E2E_STAFF_PASSWORD), active: true, orgId: org.id },
    // Password IS rotated here (unlike prisma/seed.ts, on purpose): this
    // account is throwaway test infrastructure, not a real person's login.
    update: { passwordHash: hashPassword(E2E_STAFF_PASSWORD), active: true, orgId: org.id },
  });
  await prisma.userRole.upsert({
    where: { userId_roleId_scopeKey: { userId: user.id, roleId: role.id, scopeKey: "*" } },
    create: { userId: user.id, roleId: role.id, storeId: null, scopeKey: "*" },
    update: {},
  });
  console.log("[provision] ready:", user.email);
  await prisma.$disconnect();
}

// Direct execution (`npx tsx e2e/provision.ts`) for manual debugging —
// Playwright invokes the default export itself during globalSetup.
if (process.argv[1]?.endsWith("provision.ts")) {
  provision().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
