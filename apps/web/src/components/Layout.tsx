import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import AIAssistant from './AIAssistant';

const TOP_SECTIONS = [
  { prefix: '/dashboard',    label: 'Dashboard',    icon: '📊', exact: false },
  { prefix: '/dashboard-v4', label: 'Dashboard v4', icon: '✦',  exact: false },
  { prefix: '/planning',     label: 'Planning',     icon: '🎯', exact: false },
  { prefix: '/food',         label: 'Recipes',      icon: '🍴', exact: false },
  { prefix: '/drinks',       label: 'Drinks',       icon: '🍸', exact: false },
  { prefix: '/nutrition',    label: 'Food Log',     icon: '🥗', exact: false },
  { prefix: '/workouts',     label: 'Workouts',     icon: '💪', exact: false },
  { prefix: '/history',      label: 'History',      icon: '📋', exact: false },
  { prefix: '/links',        label: 'Links',        icon: '🔗', exact: false },
  { prefix: '/settings',     label: 'Settings',     icon: '⚙️', exact: false },
];

function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
  const location = useLocation();
  const navigate = useNavigate();

  const linkCls = (active: boolean) =>
    `flex items-center px-3 py-2 rounded-lg text-base transition-colors ${
      active
        ? 'bg-dram-accent/10 text-dram-accent font-medium'
        : 'text-gray-400 hover:bg-dram-border hover:text-white'
    }`;

  function go(path: string) {
    navigate(path);
    onNavigate?.();
  }

  return (
    <nav className="flex-1 py-4 space-y-0.5 px-2 overflow-y-auto">
      {TOP_SECTIONS.map(({ prefix, label }) => {
        const isActive = location.pathname === prefix || location.pathname.startsWith(prefix + '/');
        return (
          <div key={prefix}>
            <button
              onClick={() => go(prefix)}
              className={linkCls(isActive) + ' w-full text-left'}
            >
              {label}
            </button>
          </div>
        );
      })}
    </nav>
  );
}

export default function Layout() {
  const logout = useAuthStore((s) => s.logout);

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
                `flex-1 min-w-[3.5rem] flex flex-col items-center py-2 text-sm transition-colors ${
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

      <AIAssistant />
    </div>
  );
}
