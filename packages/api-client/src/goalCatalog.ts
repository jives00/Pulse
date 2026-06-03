export type GoalCatalogKey =
  // Body
  | 'body_weight'
  | 'body_waist'
  | 'body_bicep'
  | 'body_chest'
  | 'body_hips'
  | 'body_fat_pct'
  | 'body_muscle_mass'
  | 'body_water_pct'
  // Nutrition
  | 'nutrition_calories_daily_avg'
  | 'nutrition_protein_daily_avg'
  | 'nutrition_carbs_daily_avg'
  | 'nutrition_fat_daily_avg'
  // Exercise
  | 'exercise_workouts_per_week'
  | 'exercise_minutes_per_week'
  | 'exercise_volume_per_week'
  | 'exercise_routine_sessions'
  | 'exercise_max_weight'
  | 'exercise_weekly_volume_lift'
  // Activity
  | 'activity_steps_daily_avg';

export type GoalCategory = 'body' | 'nutrition' | 'exercise' | 'activity';
export type GoalCardType = 'line_chart' | 'progress_bar';
export type GoalSourceType = 'exercise' | 'routine' | 'measurement' | 'nutrition' | 'steps';

export interface GoalCatalogEntry {
  key:          GoalCatalogKey;
  label:        string;
  category:     GoalCategory;
  cardType:     GoalCardType;
  defaultUnit:  string;
  description:  string;
  needsSource:  false | 'exercise' | 'routine';
}

export const GOAL_CATALOG: GoalCatalogEntry[] = [
  // ─── Body ──────────────────────────────────────────────────────────────────
  { key: 'body_weight',      label: 'Weight',       category: 'body', cardType: 'line_chart',    defaultUnit: 'lbs', description: 'Target body weight',           needsSource: false },
  { key: 'body_waist',       label: 'Waist',        category: 'body', cardType: 'line_chart',    defaultUnit: 'in',  description: 'Target waist measurement',     needsSource: false },
  { key: 'body_bicep',       label: 'Bicep',        category: 'body', cardType: 'line_chart',    defaultUnit: 'in',  description: 'Target bicep measurement',     needsSource: false },
  { key: 'body_chest',       label: 'Chest',        category: 'body', cardType: 'line_chart',    defaultUnit: 'in',  description: 'Target chest measurement',     needsSource: false },
  { key: 'body_hips',        label: 'Hips',         category: 'body', cardType: 'line_chart',    defaultUnit: 'in',  description: 'Target hips measurement',      needsSource: false },
  { key: 'body_fat_pct',     label: 'Body Fat %',   category: 'body', cardType: 'line_chart',    defaultUnit: '%',   description: 'Target body fat percentage',   needsSource: false },
  { key: 'body_muscle_mass', label: 'Muscle Mass',  category: 'body', cardType: 'line_chart',    defaultUnit: 'lbs', description: 'Target muscle mass',           needsSource: false },
  { key: 'body_water_pct',   label: 'Water %',      category: 'body', cardType: 'line_chart',    defaultUnit: '%',   description: 'Target body water percentage', needsSource: false },

  // ─── Nutrition ─────────────────────────────────────────────────────────────
  { key: 'nutrition_calories_daily_avg', label: 'Daily Calories', category: 'nutrition', cardType: 'line_chart', defaultUnit: 'kcal', description: 'Average daily calorie target',       needsSource: false },
  { key: 'nutrition_protein_daily_avg',  label: 'Daily Protein',  category: 'nutrition', cardType: 'line_chart', defaultUnit: 'g',    description: 'Average daily protein target',       needsSource: false },
  { key: 'nutrition_carbs_daily_avg',    label: 'Daily Carbs',    category: 'nutrition', cardType: 'line_chart', defaultUnit: 'g',    description: 'Average daily carbohydrate target',  needsSource: false },
  { key: 'nutrition_fat_daily_avg',      label: 'Daily Fat',      category: 'nutrition', cardType: 'line_chart', defaultUnit: 'g',    description: 'Average daily fat target',           needsSource: false },

  // ─── Exercise ──────────────────────────────────────────────────────────────
  { key: 'exercise_workouts_per_week',  label: 'Workouts/Week',        category: 'exercise', cardType: 'line_chart',    defaultUnit: 'workouts', description: 'Total workouts per week',                   needsSource: false },
  { key: 'exercise_minutes_per_week',   label: 'Minutes/Week',         category: 'exercise', cardType: 'line_chart',    defaultUnit: 'min',      description: 'Total workout minutes per week',            needsSource: false },
  { key: 'exercise_volume_per_week',    label: 'Weekly Volume',        category: 'exercise', cardType: 'line_chart',    defaultUnit: 'lbs',      description: 'Total weight volume lifted per week',       needsSource: false },
  { key: 'exercise_routine_sessions',   label: 'Routine Sessions/Week',category: 'exercise', cardType: 'line_chart',    defaultUnit: 'sessions', description: 'Weekly sessions for a specific routine',    needsSource: 'routine' },
  { key: 'exercise_max_weight',         label: 'Max Weight (Exercise)',category: 'exercise', cardType: 'progress_bar',  defaultUnit: 'lbs',      description: 'One-rep max or top set for an exercise',    needsSource: 'exercise' },
  { key: 'exercise_weekly_volume_lift', label: 'Weekly Volume (Exercise)', category: 'exercise', cardType: 'line_chart', defaultUnit: 'lbs',   description: 'Weekly volume for a specific exercise',     needsSource: 'exercise' },

  // ─── Activity ──────────────────────────────────────────────────────────────
  { key: 'activity_steps_daily_avg', label: 'Daily Steps', category: 'activity', cardType: 'line_chart', defaultUnit: 'steps', description: 'Average daily step count target', needsSource: false },
];

export const CATALOG_BY_KEY = Object.fromEntries(
  GOAL_CATALOG.map(e => [e.key, e])
) as Record<GoalCatalogKey, GoalCatalogEntry>;

export const CATALOG_BY_CATEGORY: Record<GoalCategory, GoalCatalogEntry[]> = {
  body:      GOAL_CATALOG.filter(e => e.category === 'body'),
  nutrition: GOAL_CATALOG.filter(e => e.category === 'nutrition'),
  exercise:  GOAL_CATALOG.filter(e => e.category === 'exercise'),
  activity:  GOAL_CATALOG.filter(e => e.category === 'activity'),
};
