
import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { User, LogOut, BarChart3, ShieldCheck, UserCircle, Settings, User as UserIcon } from 'lucide-react';
import { User as UserType } from '../types';

interface NavbarProps {
  user: UserType | null;
  onLogout: () => void;
  onOpenLogin: () => void;
}

const Navbar: React.FC<NavbarProps> = ({ user, onLogout, onOpenLogin }) => {
  const location = useLocation();

  const isActive = (path: string) => location.pathname === path ? "text-primary font-bold border-b-2 border-primary" : "text-gray-500 hover:text-primary border-b-2 border-transparent transition-all hover:border-gray-200";

  return (
    <nav className="bg-white border-b border-gray-200 sticky top-0 z-50 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16">
          <div className="flex items-center">
            <Link to="/" className="flex-shrink-0 flex items-center gap-3 group">
              <div className="bg-primary p-2 rounded-xl shadow-lg shadow-primary/20 group-hover:scale-105 transition-transform">
                <BarChart3 className="h-6 w-6 text-white" />
              </div>
              <span className="font-black text-2xl text-primary tracking-tighter">TAX<span className="text-secondary">TECH</span></span>
            </Link>
            <div className="hidden sm:ml-12 sm:flex sm:space-x-8 h-full">
              <Link to="/" className={`flex items-center px-1 text-sm font-semibold h-full ${isActive('/')}`}>Indirect Tax</Link>
              <Link to="/direct-tax" className={`flex items-center px-1 text-sm font-semibold h-full ${isActive('/direct-tax')}`}>Direct Tax</Link>
              {user && <Link to="/survey" className={`flex items-center px-1 text-sm font-semibold h-full ${isActive('/survey')}`}>Submit Data</Link>}
              {user && <Link to="/report" className={`flex items-center px-1 text-sm font-semibold h-full ${isActive('/report')}`}>Analytics</Link>}
              {user?.role === 'admin' && (
                <Link to="/admin" className={`flex items-center px-1 text-sm font-bold h-full gap-2 ${isActive('/admin')} text-orange-600`}>
                  <Settings className="h-4 w-4 animate-spin-slow" /> Control Panel
                </Link>
              )}
            </div>
          </div>
          <div className="flex items-center gap-5">
            {user ? (
              <div className="flex items-center gap-4">
                <Link to="/profile" className="block hover:opacity-90 transition-opacity">
                  <div className={`flex items-center gap-2.5 px-4 py-2 rounded-2xl border transition-all ${user.role === 'admin' ? 'bg-orange-50 border-orange-200 text-orange-800 shadow-sm' : 'bg-gray-50 border-gray-200 text-gray-700'}`}>
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
                    <div className="flex flex-col leading-tight">
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
                className="inline-flex items-center justify-center gap-2 px-6 py-2.5 text-sm font-black text-white bg-primary rounded-xl shadow-xl shadow-primary/20 hover:bg-indigo-900 hover:-translate-y-0.5 transition-all active:scale-95"
              >
                Sign In
              </button>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
};

export default Navbar;
