-- WS2.5 (SCALE-005): the dashboard low-stock query filters on the computed
-- predicate ("onHand" - reserved) <= 5, which full-scans InventoryBalance.
-- A plain column would drift (two writers: applyMovement raw UPDATE +
-- transfers create-path increment), so index the expression itself — always
-- correct regardless of writer. The dashboard query already uses this exact
-- expression form, which is what the planner needs to match the index.
CREATE INDEX IF NOT EXISTS "InventoryBalance_available_expr_idx"
  ON "InventoryBalance" (("onHand" - reserved));
