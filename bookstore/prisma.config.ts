import "dotenv/config";
import { defineConfig, env } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    url: env("DATABASE_URL"),
    // Required for `prisma migrate dev`/`migrate diff` to replay migrations into a
    // scratch database. Many of our migrations are SQL-managed (CHECKs, partial
    // unique indexes, trgm indexes) and invisible to the datamodel — without a
    // shadow DB those objects are silently dropped by generated migrations. Set
    // SHADOW_DATABASE_URL locally; CI wires it in ci.yml.
    ...(process.env.SHADOW_DATABASE_URL ? { shadowDatabaseUrl: env("SHADOW_DATABASE_URL") } : {}),
  },
});
