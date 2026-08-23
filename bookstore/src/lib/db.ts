import "dotenv/config";
import { PrismaClient } from "../generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient; pool?: pg.Pool };

// ponytail: pass an external pg.Pool — PrismaPg's internal pool config mangles SASL password in 7.9.1
function create() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
  const max = Number(process.env.DB_POOL_MAX ?? "10");
  if (!Number.isInteger(max) || max < 1 || max > 100) throw new Error("DB_POOL_MAX must be an integer from 1 to 100");
  const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    max,
    connectionTimeoutMillis: 5_000,
    idleTimeoutMillis: 30_000,
  });
  // Without this handler, an idle-client network error crashes the Node process.
  pool.on("error", (err) => {
    console.error(JSON.stringify({ level: "error", event: "pg_pool_idle_client_error", message: err.message }));
  });
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
