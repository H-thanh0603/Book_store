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

// Agent 4: trend blend — spike in current window dampened toward prior window.
// blended daily = (2 + 1) / 2 = 1.5 -> target = ceil(1.5 * 5) = 8
const spiked = calculateReplenishment({
  soldUnits: 60, priorSoldUnits: 30, historyDays: 30, availableQty: 0,
  incomingQty: 0, safetyStock: 0, leadTimeDays: 5,
});
assert.equal(spiked.averageDailySales, 2);
assert.equal(spiked.recommendedQty, 8);
// No prior window supplied -> behavior identical to v1.
assert.equal(calculateReplenishment({ soldUnits: 120, historyDays: 30, availableQty: 3, incomingQty: 0, safetyStock: 10, leadTimeDays: 5 }).recommendedQty, 27);

console.log("Phase 3 replenishment checks passed");
