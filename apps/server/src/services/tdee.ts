/**
 * TDEE breakdown: BMR + NEAT + TEF + Exercise = Total Burned
 *
 * BMR  — Mifflin-St Jeor formula
 * NEAT — non-exercise movement, approximated by activity-level multiplier applied to BMR
 * TEF  — thermic effect of food, fixed 10% of calories consumed
 * Exercise — logged workout calories_burned (passed in by caller)
 */

export type ActivityLevel = 'sedentary' | 'lightly_active' | 'moderately_active' | 'very_active';

// Mifflin-St Jeor multipliers for NEAT (activity above BMR)
// The full TDEE multiplier is listed below; NEAT = (multiplier - 1) * BMR
const ACTIVITY_MULTIPLIERS: Record<ActivityLevel, number> = {
  sedentary:          1.2,
  lightly_active:     1.375,
  moderately_active:  1.55,
  very_active:        1.725,
};

export interface TDEEBreakdown {
  bmr: number;
  neat: number;
  tef: number;
  exercise: number;
  stepsKcal: number;
  total: number;
}

/**
 * Calculate BMR using Mifflin-St Jeor.
 * @param weightKg   body weight in kg
 * @param heightCm   height in cm
 * @param ageYears   age in years
 * @param sex        'male' | 'female'
 */
export function calcBMR(weightKg: number, heightCm: number, ageYears: number, sex: 'male' | 'female'): number {
  const base = 10 * weightKg + 6.25 * heightCm - 5 * ageYears;
  return Math.round(sex === 'male' ? base + 5 : base - 161);
}

/**
 * Calculate full TDEE breakdown.
 * @param weightKg      body weight in kg (latest measurement)
 * @param heightCm      height in cm
 * @param dob           date-of-birth string YYYY-MM-DD
 * @param sex           'male' | 'female'
 * @param activityLevel activity level key
 * @param caloriesIn    total food calories consumed (for TEF)
 * @param exerciseKcal  calories burned from logged workouts
 */
export function calcTDEE(params: {
  weightKg: number;
  heightCm: number;
  dob: string;
  sex: 'male' | 'female';
  activityLevel: ActivityLevel;
  caloriesIn: number;
  exerciseKcal: number;
  stepsKcal?: number;
}): TDEEBreakdown {
  const { weightKg, heightCm, dob, sex, activityLevel, caloriesIn, exerciseKcal, stepsKcal = 0 } = params;

  const dobDate = new Date(dob + 'T00:00:00');
  const now = new Date();
  const ageYears = now.getFullYear() - dobDate.getFullYear()
    - (now < new Date(now.getFullYear(), dobDate.getMonth(), dobDate.getDate()) ? 1 : 0);

  const bmr = calcBMR(weightKg, heightCm, ageYears, sex);
  const multiplier = ACTIVITY_MULTIPLIERS[activityLevel] ?? 1.2;
  const neat = Math.round((multiplier - 1) * bmr);
  const tef = Math.round(caloriesIn * 0.1);
  const exercise = Math.round(exerciseKcal);
  const steps = Math.round(stepsKcal);
  const total = bmr + neat + tef + exercise + steps;

  return { bmr, neat, tef, exercise, stepsKcal: steps, total };
}
