export const KG_TO_LBS = 2.20462;

export function kgToLbs(kg: number): number {
  return kg * KG_TO_LBS;
}

export function lbsToKg(lbs: number): number {
  return lbs / KG_TO_LBS;
}

/** Format a kg value as rounded lbs, e.g. "135 lbs" */
export function fmtLbs(kg: number): string {
  return `${Math.round(kg * KG_TO_LBS)} lbs`;
}
