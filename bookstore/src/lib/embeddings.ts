// Semantic-search embeddings via the Gemini API (gemini-embedding-001,
// truncated to 768 dims to match the vector(768) column). Plain fetch — no
// SDK. Every entry point degrades to null/0 on missing key or network failure
// so search/recommendations keep their pre-vector behavior.
import { prisma } from "./db";

const MODEL = "models/gemini-embedding-001";
const DIMS = 768;
const BATCH = 32;
const TIMEOUT_MS = 5_000;

type EmbedRequest = {
  requests: {
    model: string;
    content: { parts: { text: string }[] };
    outputDimensionality?: number;
  }[];
};
type EmbedResponse = {
  embeddings?: { values?: number[] }[];
};

export function embeddingConfigured() {
  return Boolean(process.env.GEMINI_API_KEY);
}

/** One text → one vector, or null when unconfigured/failed. */
export async function embedText(text: string): Promise<number[] | null> {
  const [vec] = (await embedTexts([text])) ?? [];
  return vec ?? null;
}

export async function embedTexts(texts: string[]): Promise<number[][] | null> {
  const key = process.env.GEMINI_API_KEY;
  if (!key || texts.length === 0) return null;
  const out: number[][] = [];
  for (let i = 0; i < texts.length; i += BATCH) {
    const chunk = texts.slice(i, i + BATCH).map((text) => ({
      model: MODEL,
      content: { parts: [{ text }] },
      outputDimensionality: DIMS,
    }));
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:batchEmbedContents?key=${key}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ requests: chunk } satisfies EmbedRequest),
          signal: AbortSignal.timeout(TIMEOUT_MS),
        },
      );
      if (!res.ok) throw new Error(`Gemini ${res.status}`);
      const data = (await res.json()) as EmbedResponse;
      for (const e of data.embeddings ?? []) {
        if (!e.values || e.values.length !== DIMS) throw new Error(`Gemini bad embedding dim`);
        out.push(e.values);
      }
      if (out.length !== Math.min(i + BATCH, texts.length)) throw new Error("Gemini short response");
    } catch (error) {
      console.warn(JSON.stringify({ level: "warn", event: "embed_degraded", message: String(error) }));
      return null;
    }
  }
  return out;
}

/** Text fed to the embedder per product — name plus every descriptive field. */
function productText(p: {
  name: string; description: string | null;
  category?: { name: string } | null; author?: { name: string } | null;
  publisher?: { name: string } | null; brand?: { name: string } | null;
}) {
  return [
    p.name, p.category?.name, p.author?.name, p.publisher?.name, p.brand?.name, p.description,
  ].filter(Boolean).join(". ").slice(0, 8000);
}

/** Upsert one product's embedding. Fire-and-forget friendly (never throws). */
export async function embedProduct(productId: string): Promise<boolean> {
  const products = await backfillProductEmbeddings({ onlyIds: [productId] });
  return products > 0;
}

/** Embed all active products missing/stale embeddings; returns rows written. */
export async function backfillProductEmbeddings(opts: { onlyIds?: string[] } = {}): Promise<number> {
  const products = await prisma.product.findMany({
    where: { status: "active", ...(opts.onlyIds ? { id: { in: opts.onlyIds } } : {}) },
    select: {
      id: true, name: true, description: true,
      category: { select: { name: true } }, author: { select: { name: true } },
      publisher: { select: { name: true } }, brand: { select: { name: true } },
    },
  });
  let written = 0;
  for (let i = 0; i < products.length; i += BATCH) {
    const slice = products.slice(i, i + BATCH);
    const vectors = await embedTexts(slice.map(productText));
    if (!vectors) break;
    // ponytail: row-by-row upsert fine at catalog scale (~10²–10³); COPY or
    // unnest batch insert when catalog reaches 10⁴+.
    for (let j = 0; j < slice.length; j++) {
      await prisma.$executeRaw`
        INSERT INTO "ProductEmbedding" ("productId", embedding, model)
        VALUES (${slice[j].id}, ${`[${vectors[j].join(",")}]`}::vector, 'gemini-embedding-001')
        ON CONFLICT ("productId")
        DO UPDATE SET embedding = EXCLUDED.embedding, model = 'gemini-embedding-001', "updatedAt" = now()`;
      written++;
    }
  }
  return written;
}
