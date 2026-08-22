import "dotenv/config";
import { PrismaClient } from "../generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient; pool?: pg.Pool };

// ponytail: pass an external pg.Pool — PrismaPg's internal pool config mangles SASL password in 7.9.1
function create() {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  const client = new PrismaClient({ adapter: new PrismaPg(pool), log: ["error", "warn"] });
  return { pool, client };
}

export const prisma =
  globalForPrisma.prisma ??
  (() => {
    const { pool, client } = create();
    globalForPrisma.pool = pool;
    globalForPrisma.prisma = client;
    return client;
  })();

if (process.env.NODE_ENV !== "production" && !globalForPrisma.prisma) {
  // already created above; noop guard for HMR clarity
}
