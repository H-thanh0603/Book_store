-- pgvector: semantic search + content-similar recommendations.
-- Stores one 768-dim Gemini text-embedding-004 vector per Product; queried
-- via $queryRaw (Prisma has no native vector type, table is SQL-managed).
-- Same superuser caveat as pg_trgm/unaccent above: CREATE EXTENSION needs the
-- postgres superuser once; the package ships the .so (apt: postgresql-18-pgvector).
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS "ProductEmbedding" (
  "productId" TEXT PRIMARY KEY REFERENCES "Product"("id") ON DELETE CASCADE,
  embedding   vector(768) NOT NULL,
  model       TEXT NOT NULL DEFAULT 'text-embedding-004',
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "ProductEmbedding_hnsw_idx"
  ON "ProductEmbedding" USING hnsw (embedding vector_cosine_ops);
