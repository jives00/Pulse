import { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { authApi } from '@pulse/api-client';
import { useAuthStore } from './store/authStore';
import { useSettingsStore } from './store/settings';
import Layout from './components/Layout';
import Login from './pages/Login';
import Library from './pages/Library';
import RecipeHistory from './pages/RecipeHistory';
import Links from './pages/Links';
import TodayPage from './pages/TodayPage';
import NutritionHistoryPage from './pages/NutritionHistoryPage';
import FoodsPage from './pages/FoodsPage';
import WorkoutsPage from './pages/WorkoutsPage';
import DashboardPage from './pages/DashboardPage';
import WorkoutDetailPage from './pages/WorkoutDetailPage';
import ExerciseDetailPage from './pages/ExerciseDetailPage';
import RoutinesPage from './pages/RoutinesPage';
import RoutineDetailPage from './pages/RoutineDetailPage';
import ExercisesPage from './pages/ExercisesPage';
import SettingsPage from './pages/SettingsPage';
import GoalsPage from './pages/GoalsPage';
import PlanningPage from './pages/PlanningPage';
import GoalProgressPage from './pages/GoalProgressPage';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const token = useAuthStore((s) => s.token);
  if (!token) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

export default function App() {
  const basename = import.meta.env.PROD ? '/pulse' : '/';
  const colorScheme = useSettingsStore((s) => s.colorScheme);
  const setToken = useAuthStore((s) => s.setToken);

  // Passwordless auto-login on trusted networks (LAN / Tailscale). Runs once per page
  // load only when no token is stored, so an explicit logout still shows the login form.
  const [bootstrapping, setBootstrapping] = useState(() => !useAuthStore.getState().token);

  useEffect(() => {
    document.documentElement.dataset.theme = colorScheme;
  }, [colorScheme]);

  useEffect(() => {
    if (useAuthStore.getState().token) return;
    let cancelled = false;
    authApi.session()
      .then(({ token }) => { if (!cancelled) setToken(token); })
      .catch(() => { /* untrusted or offline — fall back to the login form */ })
      .finally(() => { if (!cancelled) setBootstrapping(false); });
    return () => { cancelled = true; };
  }, [setToken]);

  if (bootstrapping) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-900">
        <p className="text-slate-400 text-sm">Signing you in…</p>
      </div>
    );
  }

  return (
    <BrowserRouter basename={basename}>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <Layout />
            </ProtectedRoute>
          }
        >
          <Route index element={<Navigate to="/dashboard" replace />} />

          {/* Dashboard */}
          <Route path="dashboard" element={<DashboardPage />} />

          {/* Food */}
          <Route path="food" element={<Library />} />

          {/* Drinks */}
          <Route path="drinks" element={<Library />} />

          {/* History & Links — top-level */}
          <Route path="history" element={<RecipeHistory />} />
          <Route path="links" element={<Links />} />

          {/* Legacy redirects */}
          <Route path="recipes" element={<Navigate to="/food" replace />} />
          <Route path="recipes/history" element={<Navigate to="/history" replace />} />
          <Route path="recipes/links" element={<Navigate to="/links" replace />} />
          <Route path="food/history" element={<Navigate to="/history" replace />} />
          <Route path="food/links" element={<Navigate to="/links" replace />} />
          <Route path="drinks/history" element={<Navigate to="/history" replace />} />
          <Route path="drinks/links" element={<Navigate to="/links" replace />} />

          {/* Nutrition */}
          <Route path="nutrition" element={<Navigate to="/nutrition/today" replace />} />
          <Route path="nutrition/today" element={<TodayPage />} />
          <Route path="nutrition/history" element={<NutritionHistoryPage />} />
          <Route path="nutrition/foods" element={<FoodsPage />} />

          {/* Workouts */}
          <Route path="workouts" element={<WorkoutsPage />} />
          <Route path="workouts/exercises" element={<ExercisesPage />} />
          <Route path="workouts/exercises/:id" element={<ExerciseDetailPage />} />
          <Route path="workouts/routines" element={<RoutinesPage />} />
          <Route path="workouts/routines/:id" element={<RoutineDetailPage />} />
          <Route path="workouts/:id" element={<WorkoutDetailPage />} />

          {/* Goals & Planning */}
          <Route path="goals" element={<GoalsPage />} />
          <Route path="goals/planning" element={<PlanningPage />} />
          <Route path="goals/:id/progress" element={<GoalProgressPage />} />

          {/* Settings */}
          <Route path="settings" element={<SettingsPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
