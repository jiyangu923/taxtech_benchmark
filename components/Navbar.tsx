
import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { LogOut, ShieldCheck, UserCircle, Settings, Menu, X, Sparkles } from 'lucide-react';
import { User as UserType } from '../types';

interface NavbarProps {
  user: UserType | null;
  onLogout: () => void;
  onOpenLogin: () => void;
}

const Navbar: React.FC<NavbarProps> = ({ user, onLogout, onOpenLogin }) => {
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);

  const desktopClass = (path: string) =>
    location.pathname === path
      ? "text-primary font-bold border-b-2 border-primary"
      : "text-gray-500 hover:text-primary border-b-2 border-transparent transition-all hover:border-gray-200";

  const mobileClass = (path: string) =>
    location.pathname === path
      ? "text-primary font-bold bg-indigo-50"
      : "text-gray-600 hover:text-primary hover:bg-gray-50";

  type NavItem = { to: string; label: string; show: boolean; admin?: boolean; ai?: boolean };
  const links: NavItem[] = [
    { to: '/', label: 'Indirect Tax', show: true },
    { to: '/direct-tax', label: 'Direct Tax', show: true },
    { to: '/survey', label: 'Submit Data', show: !!user },
    { to: '/report', label: 'Analytics', show: !!user },
    { to: '/taxi', label: 'Taxi AI', show: !!user, ai: true },
    { to: '/admin', label: 'Control Panel', show: user?.role === 'admin', admin: true },
  ];

  return (
    <nav className="bg-white border-b border-gray-200 sticky top-0 z-50 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16">
          <div className="flex items-center">
            <Link to="/" className="flex-shrink-0 flex items-center gap-2.5 group">
              <div className="w-8 h-8 border-[1.5px] border-gray-900 rounded-md grid place-items-center font-mono text-[13px] font-semibold text-gray-900 group-hover:border-primary group-hover:text-primary transition-colors">
                b
              </div>
              <span className="font-display text-[19px] font-semibold tracking-tight text-gray-900">
                taxbenchmark<span className="text-amber-acc">.</span>ai
              </span>
            </Link>
            {/* Desktop nav */}
            <div className="hidden sm:ml-12 sm:flex sm:space-x-8 h-full">
              {links.filter(l => l.show).map(l => (
                <Link key={l.to} to={l.to} className={`flex items-center px-1 text-sm font-semibold h-full gap-1.5 ${l.admin ? 'text-orange-600 ' + (location.pathname === l.to ? 'border-b-2 border-orange-600 font-bold' : 'border-b-2 border-transparent') : desktopClass(l.to)}`}>
                  {l.admin && <Settings className="h-4 w-4" />}
                  {l.ai && <Sparkles className="h-3.5 w-3.5 text-amber-acc-2" />}
                  {l.label}
                </Link>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-3">
            {user ? (
              <div className="flex items-center gap-3 sm:gap-4">
                <Link to="/profile" className="block hover:opacity-90 transition-opacity">
                  <div className={`flex items-center gap-2.5 px-3 sm:px-4 py-2 rounded-2xl border transition-all ${user.role === 'admin' ? 'bg-orange-50 border-orange-200 text-orange-800 shadow-sm' : 'bg-gray-50 border-gray-200 text-gray-700'}`}>
                    {user.role === 'admin' ? (
                      <div className="relative">
                          <ShieldCheck className="h-5 w-5 text-orange-600 fill-orange-100" />
                          <span className="absolute -top-1 -right-1 flex h-2 w-2">
                              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-orange-400 opacity-75"></span>
                              <span className="relative inline-flex rounded-full h-2 w-2 bg-orange-500"></span>
                          </span>
                      </div>
                    ) : (
                      <UserCircle className="h-5 w-5 text-gray-400" />
                    )}
                    <div className="hidden sm:flex flex-col leading-tight">
                      <span className="text-[10px] font-bold uppercase tracking-wider opacity-60">{user.role}</span>
                      <span className="text-sm font-bold truncate max-w-[140px]">{user.name}</span>
                    </div>
                  </div>
                </Link>
                <button
                  onClick={onLogout}
                  className="p-2.5 rounded-xl text-gray-400 hover:text-red-600 hover:bg-red-50 transition-all active:scale-95"
                  title="Secure Logout"
                >
                  <LogOut className="h-5 w-5" />
                </button>
              </div>
            ) : (
              <button
                onClick={onOpenLogin}
                className="inline-flex items-center justify-center gap-2 px-4 sm:px-6 py-2.5 text-sm font-black text-white bg-primary rounded-xl shadow-xl shadow-primary/20 hover:bg-indigo-900 hover:-translate-y-0.5 transition-all active:scale-95"
              >
                Sign In
              </button>
            )}
            {/* Mobile hamburger */}
            <button
              onClick={() => setMobileOpen(!mobileOpen)}
              className="sm:hidden p-2 rounded-xl text-gray-500 hover:text-primary hover:bg-gray-100 transition-all"
              aria-label="Toggle navigation menu"
            >
              {mobileOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
            </button>
          </div>
        </div>
      </div>
      {/* Mobile menu */}
      {mobileOpen && (
        <div className="sm:hidden border-t border-gray-100 bg-white shadow-lg">
          <div className="px-4 py-3 space-y-1">
            {links.filter(l => l.show).map(l => (
              <Link key={l.to} to={l.to} onClick={() => setMobileOpen(false)} className={`block px-4 py-3 rounded-xl text-sm font-semibold transition-all ${l.admin ? 'text-orange-600 ' + (location.pathname === l.to ? 'bg-orange-50 font-bold' : 'hover:bg-orange-50') : mobileClass(l.to)}`}>
                <span className="flex items-center gap-2">
                  {l.admin && <Settings className="h-4 w-4" />}
                  {l.ai && <Sparkles className="h-3.5 w-3.5 text-amber-acc-2" />}
                  {l.label}
                </span>
              </Link>
            ))}
          </div>
        </div>
      )}
    </nav>
  );
};

export default Navbar;
