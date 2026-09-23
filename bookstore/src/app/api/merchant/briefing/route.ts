// Merchant morning briefing: proactive anomalies + digest counts.
// Staff only (reports.store.view). Numbers only — the merchant LLM skill
// narrates; the Action Center page renders the cards directly.
import { requirePermission } from "@/lib/auth";
import { apiError, ok } from "@/lib/api";
import { scanAnomalies } from "@/lib/merchant-anomaly";
import { getDigestStats } from "@/lib/merchant-agent";
import { requireOrgId } from "@/lib/org-scope";

export async function GET() {
  try {
    const auth = await requirePermission("reports.store.view");
    const scope = { orgId: requireOrgId(auth) };
    const [anomalies, digest] = await Promise.all([
      scanAnomalies(scope),
      getDigestStats(scope),
    ]);
    return ok({
      generatedAt: new Date().toISOString(),
      anomalies,
      digest,
      urgentCount: anomalies.filter((a) => a.severity === "urgent").length,
    });
  } catch (err) {
    return apiError(err);
  }
}
