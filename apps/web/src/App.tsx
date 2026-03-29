import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './store/authStore';
import Layout from './components/Layout';
import Login from './pages/Login';
import Library from './pages/Library';
import RecipeHistory from './pages/RecipeHistory';
import Links from './pages/Links';
import TodayPage from './pages/TodayPage';
import NutritionHistoryPage from './pages/NutritionHistoryPage';
import FoodsPage from './pages/FoodsPage';
import WorkoutsPage from './pages/WorkoutsPage';
import WorkoutDetailPage from './pages/WorkoutDetailPage';
import GoalsPage from './pages/GoalsPage';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const token = useAuthStore((s) => s.token);
  if (!token) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

// Placeholder for sections added in later phases
function ComingSoon({ label }: { label: string }) {
  return (
    <div className="flex items-center justify-center h-full text-slate-400 text-sm">
      {label} — coming soon
    </div>
  );
}

export default function App() {
  const basename = import.meta.env.PROD ? '/pulse' : '/';

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
          <Route index element={<Navigate to="/recipes" replace />} />

          {/* Recipes */}
          <Route path="recipes" element={<Library />} />
          <Route path="recipes/history" element={<RecipeHistory />} />
          <Route path="recipes/links" element={<Links />} />

          {/* Nutrition */}
          <Route path="nutrition" element={<Navigate to="/nutrition/today" replace />} />
          <Route path="nutrition/today" element={<TodayPage />} />
          <Route path="nutrition/history" element={<NutritionHistoryPage />} />
          <Route path="nutrition/foods" element={<FoodsPage />} />

          {/* Workouts — Phase 3 */}
          <Route path="workouts" element={<WorkoutsPage />} />
          <Route path="workouts/:id" element={<WorkoutDetailPage />} />

          {/* Goals — Phase 4 */}
          <Route path="goals" element={<GoalsPage />} />

          {/* Settings */}
          <Route path="settings" element={<ComingSoon label="Settings" />} />
        </Route>
        <Route path="*" element={<Navigate to="/recipes" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
