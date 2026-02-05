"use strict";
'use client';
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = DashboardLayout;
const react_1 = require("react");
const navigation_1 = require("next/navigation");
const link_1 = __importDefault(require("next/link"));
const store_1 = require("@/lib/store");
const lucide_react_1 = require("lucide-react");
const navItems = [
    { href: '/dashboard', label: 'Dashboard', icon: lucide_react_1.LayoutDashboard },
    { href: '/dashboard/bots', label: 'Bots', icon: lucide_react_1.Bot },
    { href: '/dashboard/goals', label: 'Goals', icon: lucide_react_1.Target },
    { href: '/dashboard/tasks', label: 'Tasks', icon: lucide_react_1.ListTodo },
    { href: '/dashboard/approvals', label: 'Approvals', icon: lucide_react_1.CheckSquare },
    { href: '/dashboard/logbook', label: 'Logbook', icon: lucide_react_1.BookOpen },
    { href: '/dashboard/safety', label: 'Safety', icon: lucide_react_1.Shield },
    { type: 'divider' },
    { href: '/dashboard/trade', label: 'Trade', icon: lucide_react_1.TrendingUp },
    { href: '/dashboard/store', label: 'Store', icon: lucide_react_1.ShoppingCart },
    { href: '/dashboard/social', label: 'Social', icon: lucide_react_1.Video },
    { href: '/dashboard/research', label: 'Research', icon: lucide_react_1.Search },
];
function DashboardLayout({ children }) {
    const router = (0, navigation_1.useRouter)();
    const pathname = (0, navigation_1.usePathname)();
    const { user, org, isLoading, isAuthenticated, loadUser, logout } = (0, store_1.useAuthStore)();
    const { status: killSwitchStatus, loadStatus: loadKillSwitch } = (0, store_1.useKillSwitchStore)();
    (0, react_1.useEffect)(() => {
        loadUser();
        loadKillSwitch();
    }, [loadUser, loadKillSwitch]);
    (0, react_1.useEffect)(() => {
        if (!isLoading && !isAuthenticated) {
            router.push('/login');
        }
    }, [isLoading, isAuthenticated, router]);
    const handleLogout = async () => {
        await logout();
        router.push('/');
    };
    if (isLoading) {
        return (<div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-500"></div>
      </div>);
    }
    if (!isAuthenticated) {
        return null;
    }
    return (<div className="min-h-screen bg-gray-950 flex">
      {/* Sidebar */}
      <aside className="w-64 bg-gray-900 border-r border-gray-800 flex flex-col">
        {/* Logo */}
        <div className="p-4 border-b border-gray-800">
          <link_1.default href="/" className="flex items-center gap-2">
            <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg"/>
            <span className="text-xl font-bold text-white">Nova</span>
          </link_1.default>
        </div>

        {/* Kill Switch Warning */}
        {killSwitchStatus?.enabled && (<div className="mx-4 mt-4 p-3 bg-red-500/10 border border-red-500/50 rounded-lg">
            <div className="flex items-center gap-2 text-red-400 text-sm">
              <lucide_react_1.AlertTriangle className="w-4 h-4"/>
              <span className="font-medium">Kill Switch Active</span>
            </div>
            {killSwitchStatus.reason && (<p className="text-xs text-red-400/70 mt-1">{killSwitchStatus.reason}</p>)}
          </div>)}

        {/* Navigation */}
        <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
          {navItems.map((item, i) => {
            if (item.type === 'divider') {
                return <div key={i} className="h-px bg-gray-800 my-3"/>;
            }
            const Icon = item.icon;
            const isActive = pathname === item.href;
            return (<link_1.default key={item.href} href={item.href} className={`flex items-center gap-3 px-3 py-2 rounded-lg transition ${isActive
                    ? 'bg-blue-600/20 text-blue-400'
                    : 'text-gray-400 hover:text-white hover:bg-gray-800'}`}>
                <Icon className="w-5 h-5"/>
                <span>{item.label}</span>
              </link_1.default>);
        })}
        </nav>

        {/* User section */}
        <div className="p-4 border-t border-gray-800">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-9 h-9 bg-gray-700 rounded-full flex items-center justify-center">
              <span className="text-sm font-medium text-white">
                {user?.email?.[0]?.toUpperCase() || 'U'}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-white truncate">{user?.email}</p>
              <p className="text-xs text-gray-500 truncate">{org?.name}</p>
            </div>
          </div>
          <div className="flex gap-2">
            <link_1.default href="/dashboard/settings" className="flex-1 flex items-center justify-center gap-2 px-3 py-2 text-sm text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition">
              <lucide_react_1.Settings className="w-4 h-4"/>
            </link_1.default>
            <button onClick={handleLogout} className="flex-1 flex items-center justify-center gap-2 px-3 py-2 text-sm text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition">
              <lucide_react_1.LogOut className="w-4 h-4"/>
            </button>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto">
        {children}
      </main>
    </div>);
}
