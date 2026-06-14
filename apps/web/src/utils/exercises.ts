export const EXERCISE_TYPES = ['weight', 'bodyweight', 'cardio', 'duration', 'resistance'] as const;

export const TRACKED_FIELD_OPTIONS = [
  { key: 'reps',     label: 'Reps' },
  { key: 'weight',   label: 'Weight (lbs)' },
  { key: 'duration', label: 'Duration (min:sec)' },
  { key: 'distance', label: 'Distance' },
] as const;

// ponytail: defaultTrackedFields lives in @pulse/api-client — import from there

export const CATEGORY_EMOJI: Record<string, string> = {
  chest: '🫁', back: '🦾', shoulders: '💪', arms: '💪',
  legs: '🦵', glutes: '🍑', core: '⚡', cardio: '🏃',
  olympic: '🥇', plyometrics: '🦘', stretching: '🧘',
};
