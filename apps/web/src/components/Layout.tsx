import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';

const FOOD_SUBS = [
  { label: 'Main Dishes', sub: 'main' },
  { label: 'Side Dishes', sub: 'side' },
  { label: 'Breakfast',   sub: 'breakfast' },
  { label: 'Desserts',    sub: 'dessert' },
];

const TOP_SECTIONS = [
  { prefix: '/food',      label: 'Food',      icon: '🍴' },
  { prefix: '/drinks',    label: 'Drinks',    icon: '🍸' },
  { prefix: '/nutrition', label: 'Nutrition', icon: '🥗' },
  { prefix: '/workouts',  label: 'Workouts',  icon: '💪' },
  { prefix: '/goals',     label: 'Goals',     icon: '🎯' },
  { prefix: '/history',   label: 'History',   icon: '📋' },
  { prefix: '/links',     label: 'Links',     icon: '🔗' },
  { prefix: '/settings',  label: 'Settings',  icon: '⚙️' },
];

function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
  const location = useLocation();
  const navigate = useNavigate();
  const params = new URLSearchParams(location.search);
  const activeSub = params.get('sub') ?? '';

  const inFood     = location.pathname.startsWith('/food');
  const inDrinks   = location.pathname.startsWith('/drinks');
  const inWorkouts = location.pathname.startsWith('/workouts');

  const linkCls = (active: boolean) =>
    `flex items-center px-3 py-2 rounded-lg text-base transition-colors ${
      active
        ? 'bg-dram-accent/10 text-dram-accent font-medium'
        : 'text-gray-400 hover:bg-dram-border hover:text-white'
    }`;

  const subLinkCls = (active: boolean) =>
    `flex items-center pl-8 pr-3 py-1.5 rounded-lg text-sm transition-colors ${
      active
        ? 'text-dram-accent font-medium'
        : 'text-gray-500 hover:text-gray-200'
    }`;

  function go(path: string) {
    navigate(path);
    onNavigate?.();
  }

  return (
    <nav className="flex-1 py-4 space-y-0.5 px-2 overflow-y-auto">
      {TOP_SECTIONS.map(({ prefix, label, icon }) => {
        const isActive = location.pathname.startsWith(prefix);
        return (
          <div key={prefix}>
            <button
              onClick={() => go(prefix)}
              className={linkCls(isActive) + ' w-full text-left'}
            >
              {label}
            </button>

            {/* Food sub-nav */}
            {prefix === '/food' && inFood && (
              <div className="mt-0.5 space-y-0.5 mb-1">
                <button
                  onClick={() => go('/food')}
                  className={subLinkCls(!activeSub)}
                >
                  All Food
                </button>
                {FOOD_SUBS.map(({ label: subLabel, sub }) => (
                  <button
                    key={sub}
                    onClick={() => go(`/food?sub=${sub}`)}
                    className={subLinkCls(activeSub === sub)}
                  >
                    {subLabel}
                  </button>
                ))}
              </div>
            )}

            {/* Workouts sub-nav */}
            {prefix === '/workouts' && inWorkouts && (
              <div className="mt-0.5 space-y-0.5 mb-1">
                <button
                  onClick={() => go('/workouts')}
                  className={subLinkCls(location.pathname === '/workouts')}
                >
                  Log
                </button>
                <button
                  onClick={() => go('/workouts/routines')}
                  className={subLinkCls(location.pathname.startsWith('/workouts/routines'))}
                >
                  Routines
                </button>
                <button
                  onClick={() => go('/workouts/exercises')}
                  className={subLinkCls(location.pathname.startsWith('/workouts/exercises'))}
                >
                  Exercises
                </button>
              </div>
            )}

          </div>
        );
      })}
    </nav>
  );
}

export default function Layout() {
  const logout = useAuthStore((s) => s.logout);
  const location = useLocation();

  const mobileItems = TOP_SECTIONS;

  return (
    <div className="flex h-screen overflow-hidden bg-dram-bg">
      {/* Sidebar — desktop */}
      <aside className="hidden lg:flex flex-col w-48 bg-dram-card border-r border-dram-border shrink-0">
        <div className="px-4 py-5 border-b border-dram-border">
          <span className="text-lg font-semibold text-white">Pulse</span>
        </div>

        <SidebarNav />

        <div className="p-2 border-t border-dram-border">
          <button
            onClick={logout}
            className="w-full flex items-center px-3 py-2 rounded-lg text-base text-gray-400 hover:bg-dram-border hover:text-white transition-colors"
          >
            Sign out
          </button>
        </div>
      </aside>

      {/* Bottom nav — mobile */}
      <div className="lg:hidden fixed bottom-0 inset-x-0 bg-dram-card border-t border-dram-border z-50">
        <nav className="flex overflow-x-auto">
          {mobileItems.map(({ prefix, label, icon }) => (
            <NavLink
              key={prefix}
              to={prefix}
              className={({ isActive }) =>
                `flex-1 min-w-[3.5rem] flex flex-col items-center py-2 text-xs transition-colors ${
                  isActive ? 'text-dram-accent' : 'text-gray-400'
                }`
              }
            >
              <span className="text-lg">{icon}</span>
              <span className="truncate">{label}</span>
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
