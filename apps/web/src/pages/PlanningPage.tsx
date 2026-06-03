import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { routinesApi, exercisesApi, type RoutineSummary, type Exercise } from '@pulse/api-client';
import PlanningCalendarCard from './PlanningCalendarCard';

export default function PlanningPage() {
  const navigate = useNavigate();
  const [routines,   setRoutines]   = useState<RoutineSummary[]>([]);
  const [exercises,  setExercises]  = useState<Exercise[]>([]);

  useEffect(() => {
    routinesApi.getAll().then(setRoutines).catch(() => {});
    exercisesApi.getAll().then(setExercises).catch(() => {});
  }, []);

  return (
    <div className="min-h-screen bg-dram-bg">
      <div className="px-6 pt-5 pb-0 border-b border-dram-border">
        <h1 className="text-xl font-semibold text-slate-200">Planning</h1>
        <div className="flex gap-1 mt-3">
          <button
            onClick={() => navigate('/goals')}
            className="px-4 py-2 text-sm font-medium transition border-b-2 -mb-px border-transparent text-dram-muted hover:text-slate-200"
          >
            Goals
          </button>
          <button className="px-4 py-2 text-sm font-medium transition border-b-2 -mb-px border-dram-accent text-dram-accent">
            Planning
          </button>
        </div>
      </div>
      <div className="px-6 py-6">
        <PlanningCalendarCard routinesList={routines} exercisesList={exercises} />
      </div>
    </div>
  );
}
