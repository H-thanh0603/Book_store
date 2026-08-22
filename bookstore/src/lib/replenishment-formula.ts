export type ReplenishmentInput = {
  soldUnits: number;
  historyDays: number;
  availableQty: number;
  incomingQty: number;
  safetyStock: number;
  leadTimeDays: number;
  /** Agent 4: units sold in the previous equal-length window, for trend/seasonality. */
  priorSoldUnits?: number;
};

export function calculateReplenishment(input: ReplenishmentInput) {
  const averageDailySales = input.historyDays > 0 ? input.soldUnits / input.historyDays : 0;
  // Trend: blend current vs previous-window velocity. A one-window spike is dampened
  // to the mean of both; sustained growth still lifts the forecast.
  let effectiveDaily = averageDailySales;
  if (input.priorSoldUnits !== undefined && input.historyDays > 0) {
    const priorDaily = input.priorSoldUnits / input.historyDays;
    if (averageDailySales > 0 || priorDaily > 0)
      effectiveDaily = (averageDailySales + priorDaily) / 2;
  }
  const targetQty = Math.ceil(effectiveDaily * input.leadTimeDays + input.safetyStock);
  return {
    averageDailySales,
    daysOfCover: averageDailySales > 0 ? input.availableQty / averageDailySales : null,
    recommendedQty: Math.max(0, targetQty - input.availableQty - input.incomingQty),
  };
}
