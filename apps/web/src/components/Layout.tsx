import { NavLink, Outlet } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';

const navItems = [
  { to: '/recipes',   label: 'Recipes',   icon: '🍽️' },
  { to: '/nutrition', label: 'Nutrition', icon: '🥗' },
  { to: '/workouts',  label: 'Workouts',  icon: '💪' },
  { to: '/goals',     label: 'Goals',     icon: '🎯' },
  { to: '/settings',  label: 'Settings',  icon: '⚙️' },
];

export default function Layout() {
  const logout = useAuthStore((s) => s.logout);

  return (
    <div className="flex min-h-screen bg-slate-900">
      {/* Sidebar — desktop */}
      <aside className="hidden lg:flex flex-col w-48 bg-slate-800 border-r border-slate-700 shrink-0">
        <div className="px-4 py-5 border-b border-slate-700">
          <span className="text-lg font-semibold text-slate-100">Pulse</span>
        </div>

        <nav className="flex-1 py-4 space-y-1 px-2">
          {navItems.map(({ to, label, icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors ${
                  isActive
                    ? 'bg-brand-600/20 text-brand-400 font-medium'
                    : 'text-slate-400 hover:bg-slate-700 hover:text-slate-100'
                }`
              }
            >
              <span>{icon}</span>
              {label}
            </NavLink>
          ))}
        </nav>

        <div className="p-2 border-t border-slate-700">
          <button
            onClick={logout}
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-slate-400 hover:bg-slate-700 hover:text-slate-100 transition-colors"
          >
            <span>🚪</span> Sign out
          </button>
        </div>
      </aside>

      {/* Bottom nav — mobile */}
      <div className="lg:hidden fixed bottom-0 inset-x-0 bg-slate-800 border-t border-slate-700 z-50">
        <nav className="flex">
          {navItems.map(({ to, label, icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `flex-1 flex flex-col items-center py-2 text-xs transition-colors ${
                  isActive ? 'text-brand-400' : 'text-slate-400'
                }`
              }
            >
              <span className="text-lg">{icon}</span>
              {label}
            </NavLink>
          ))}
        </nav>
      </div>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto pb-16 lg:pb-0">
        <Outlet />
      </main>
    </div>
  );
}
