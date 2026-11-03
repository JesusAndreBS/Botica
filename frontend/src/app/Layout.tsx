import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../features/auth/store';

const navItems = [
  { path: '/pos', label: 'POS', icon: '🛒' },
  { path: '/alertas', label: 'Alertas', icon: '🔔' },
  { path: '/productos', label: 'Productos', icon: '📦' },
  { path: '/ventas', label: 'Ventas', icon: '📊' },
  { path: '/configuracion', label: 'Config', icon: '⚙️' }
];

export function Layout() {
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <div className="min-h-screen bg-gray-50 flex">
      <aside className="w-64 bg-white border-r border-gray-200 flex flex-col hidden md:block">
        <div className="p-4 border-b border-gray-200">
          <h1 className="text-xl font-bold text-blue-600">Nova Salud</h1>
          <p className="text-xs text-gray-500">Sistema de Gestión</p>
        </div>
        <nav className="flex-1 p-4 space-y-1">
          {navItems.map(item => (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) => `flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${
                isActive ? 'bg-blue-50 text-blue-600 font-medium' : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              <span>{item.icon}</span>
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="p-4 border-t border-gray-200">
          <div className="flex items-center gap-3 px-3 py-2">
            <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-medium">
              {user?.fullName?.[0]?.toUpperCase() || 'U'}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{user?.fullName}</p>
              <p className="text-xs text-gray-500 capitalize">{user?.role?.toLowerCase()}</p>
            </div>
            <button onClick={handleLogout} className="text-gray-400 hover:text-gray-600 p-1" title="Cerrar sesión">🚪</button>
          </div>
        </div>
      </aside>
      <div className="flex-1 flex flex-col min-w-0">
        <header className="bg-white border-b border-gray-200 px-4 py-3 md:hidden flex items-center justify-between">
          <h1 className="text-lg font-bold text-blue-600">Nova Salud</h1>
        </header>
        <main className="flex-1 p-4 md:p-6 overflow-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}