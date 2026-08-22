import assert from "node:assert/strict";
import { calculateReplenishment } from "../src/lib/replenishment-formula";

const risk = calculateReplenishment({
  soldUnits: 120, historyDays: 30, availableQty: 3,
  incomingQty: 0, safetyStock: 10, leadTimeDays: 5,
});
assert.equal(risk.averageDailySales, 4);
assert.equal(risk.recommendedQty, 27);

const covered = calculateReplenishment({
  soldUnits: 30, historyDays: 30, availableQty: 10,
  incomingQty: 10, safetyStock: 5, leadTimeDays: 5,
});
assert.equal(covered.recommendedQty, 0);

console.log("Phase 3 replenishment checks passed");
