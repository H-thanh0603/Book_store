export type ReplenishmentInput = {
  soldUnits: number;
  historyDays: number;
  availableQty: number;
  incomingQty: number;
  safetyStock: number;
  leadTimeDays: number;
};

export function calculateReplenishment(input: ReplenishmentInput) {
  const averageDailySales = input.historyDays > 0 ? input.soldUnits / input.historyDays : 0;
  const targetQty = Math.ceil(averageDailySales * input.leadTimeDays + input.safetyStock);
  return {
    averageDailySales,
    daysOfCover: averageDailySales > 0 ? input.availableQty / averageDailySales : null,
    recommendedQty: Math.max(0, targetQty - input.availableQty - input.incomingQty),
  };
}
