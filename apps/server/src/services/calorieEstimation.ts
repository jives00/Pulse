import { runWithTools } from './aiProvider';

const caloriesBurnedTool = {
  name: 'set_calories_burned',
  description: 'Set the estimated calories burned during a workout session',
  schema: {
    type: 'object' as const,
    properties: {
      calories_burned: { type: 'number', description: 'Total calories burned (kcal), rounded to nearest integer' },
      confidence: { type: 'string', enum: ['high', 'medium', 'low'], description: 'Estimation confidence' },
    },
    required: ['calories_burned', 'confidence'],
  },
};

export async function estimateCaloriesBurned(workout: {
  name: string;
  durationMinutes: number;
  bodyWeightKg: number;
  exercises: Array<{
    name: string;
    sets: Array<{
      reps?: number | null;
      weightKg?: number | null;
      durationSeconds?: number | null;
      distanceMeters?: number | null;
    }>;
  }>;
}): Promise<number> {
  const { name, durationMinutes, bodyWeightKg, exercises } = workout;

  const exerciseSummary = exercises
    .map((ex) => {
      const setLines = ex.sets
        .filter((s) => s.reps || s.durationSeconds || s.distanceMeters)
        .map((s) => {
          const parts: string[] = [];
          if (s.reps) parts.push(`${s.reps} reps`);
          if (s.weightKg) parts.push(`@ ${s.weightKg.toFixed(1)} kg`);
          if (s.durationSeconds) {
            const m = Math.floor(s.durationSeconds / 60);
            const sec = s.durationSeconds % 60;
            parts.push(m > 0 ? `${m}m ${sec}s` : `${sec}s`);
          }
          if (s.distanceMeters) parts.push(`${s.distanceMeters}m`);
          return parts.join(' ');
        });
      const setsStr = setLines.length ? `${setLines.length} sets: ${setLines.join(', ')}` : `${ex.sets.length} sets`;
      return `- ${ex.name}: ${setsStr}`;
    })
    .join('\n');

  const prompt = `Estimate the total calories burned during this workout session.

Workout: ${name || 'Untitled'}
Duration: ${durationMinutes} minutes
Body weight: ${bodyWeightKg.toFixed(1)} kg

Exercises performed:
${exerciseSummary || '(no exercises logged)'}

Consider intensity, body weight, duration, and exercise types (strength training, cardio, etc.).`;

  const result = await runWithTools({ model: 'haiku', prompt, tool: caloriesBurnedTool });
  return Math.round(Number(result.calories_burned));
}
