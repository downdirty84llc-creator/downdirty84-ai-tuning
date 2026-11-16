/** Server-generated provenance, never accepted from a request or backfilled. */
export const FUEL_POLICY = 'GAS_AFR_FAILCLOSED_V1';
export function currentFuelPolicy(value: any): boolean {
  return value?.fuelPolicy === FUEL_POLICY &&
    (value?.thresholdProfile === 'NA_GAS' || value?.thresholdProfile === 'BOOSTED_GAS');
}
