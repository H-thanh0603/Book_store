// MerchantBackend — the merchant agent's contract over analytics, catalog,
// inventory, pricing and campaign systems. Mirrors anthropics/commerce-agents
// `merchant_agent/backend.py::MerchantBackend`.
//
// A merchant pilot implements the READ methods and has the writes refuse: the
// model explains and proposes; every write is a StagedChange the host's
// approval surface applies (see lib/staged-changes.ts). Deployments with no
// write path keep digests and metrics running with zero write risk.

import {
  detectListingIssues,
  filterSlowMovers,
  getDigestStats,
  getListingIssues,
  getSlowMovers,
  getTopSuggestions,
  type DigestStats,
  type ListingIssue,
  type SlowMover,
  type SuggestionRow,
} from "../merchant-agent";
import { unavailable, type Unavailable } from "./types";

export type MerchantReadInput = {
  storeId?: string;
  take?: number;
};

/** A write the backend refuses — surfaced to the model as a staged proposal. */
export type RefusedWrite = {
  refused: true;
  reason: string;
  stagedKind: string;
};

export function refusedWrite(stagedKind: string, reason: string): RefusedWrite {
  return { refused: true, reason, stagedKind };
}

export interface MerchantBackend {
  readonly kind: string;
  // ── Reads (a pilot implements these eight) ──
  getDigestStats(input?: { storeId?: string }): Promise<DigestStats | Unavailable>;
  getTopSuggestions(input?: MerchantReadInput): Promise<SuggestionRow[] | Unavailable>;
  getSlowMovers(input?: MerchantReadInput): Promise<SlowMover[] | Unavailable>;
  getListingIssues(input?: MerchantReadInput): Promise<ListingIssue[] | Unavailable>;
  // ── Writes (refuse by default; approval surface applies them) ──
  applyChange(input: {
    kind: string;
    payload: Record<string, unknown>;
  }): Promise<{ applied: true; id: string } | RefusedWrite>;
}

export class PrismaMerchantBackend implements MerchantBackend {
  readonly kind = "prisma";

  async getDigestStats(input?: { storeId?: string }) {
    return getDigestStats(input?.storeId);
  }

  async getTopSuggestions(input?: MerchantReadInput) {
    return getTopSuggestions(input?.storeId, input?.take ?? 8);
  }

  async getSlowMovers(input?: MerchantReadInput) {
    return getSlowMovers(input?.take ?? 10);
  }

  async getListingIssues(input?: MerchantReadInput) {
    return getListingIssues(input?.take ?? 50);
  }

  async applyChange(input: { kind: string; payload: Record<string, unknown> }) {
    // The model never calls a mutation: every write stays a staged change the
    // human applies through the approval surface. Same rule on every path.
    return refusedWrite(
      input.kind,
      "Merchant writes are staged-only — propose via StagedChange and wait for human approval.",
    );
  }
}

const STUB_REASON =
  "Merchant backend chưa cấu hình (COMMERCE_BACKEND=stub) — reads unavailable, writes refuse.";

export class StubMerchantBackend implements MerchantBackend {
  readonly kind = "stub";

  async getDigestStats(_input?: { storeId?: string }): Promise<DigestStats | Unavailable> {
    return unavailable(STUB_REASON);
  }

  async getTopSuggestions(_input?: MerchantReadInput): Promise<SuggestionRow[] | Unavailable> {
    return unavailable(STUB_REASON);
  }

  async getSlowMovers(_input?: MerchantReadInput): Promise<SlowMover[] | Unavailable> {
    return unavailable(STUB_REASON);
  }

  async getListingIssues(_input?: MerchantReadInput): Promise<ListingIssue[] | Unavailable> {
    return unavailable(STUB_REASON);
  }

  async applyChange(input: { kind: string; payload: Record<string, unknown> }) {
    return refusedWrite(input.kind, STUB_REASON);
  }
}

// Re-export the pure detectors so deployments and tests share one source.
export { detectListingIssues, filterSlowMovers };
