import React, { useState, useEffect } from 'react';
import { HashRouter, Routes, Route, Navigate, Link, useLocation } from 'react-router-dom';
import Navbar from './components/Navbar';
import AuthModal from './components/AuthModal';
import SetPasswordModal from './components/SetPasswordModal';
import Home from './pages/Home';
import Survey from './pages/Survey';
import Admin from './pages/Admin';
import Report from './pages/Report';
import DirectTax from './pages/DirectTax';
import Profile from './pages/Profile';
import { User } from './types';
import { supabase, api } from './services/api';

const PAGE_TITLES: Record<string, string> = {
  '/': 'Indirect Tax Benchmark | TaxTech',
  '/direct-tax': 'Direct Tax Benchmark | TaxTech',
  '/survey': 'Submit Data | TaxTech',
  '/report': 'Analytics | TaxTech',
  '/admin': 'Control Panel | TaxTech',
  '/profile': 'Profile | TaxTech',
};

function PageTitle() {
  const { pathname } = useLocation();
  useEffect(() => {
    document.title = PAGE_TITLES[pathname] || 'TaxTech Benchmark';
  }, [pathname]);
  return null;
}

const App: React.FC = () => {
  const [user, setUser] = useState<User | null>(null);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [needsPasswordSet, setNeedsPasswordSet] = useState(false);

  useEffect(() => {
    // Detect invite flow: Supabase puts #access_token=...&type=invite in the URL hash
    const hash = window.location.hash;
    if (hash.includes('type=invite')) {
      setNeedsPasswordSet(true);
    }

    // Use the session loaded in index.tsx (before React mounted) to avoid
    // StrictMode double-fire causing Supabase lock conflicts.
    const initialSession = (window as any).__INITIAL_SESSION__;
    if (initialSession?.user) {
      api.getCurrentUser().then((profile) => {
        if (profile) setUser(profile);
      });
    }

    // Listen for sign-in / sign-out (including OAuth redirects back from Google)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'INITIAL_SESSION') return; // already handled above
      if (session?.user) {
        const profile = await api.getCurrentUser();
        if (profile) setUser(profile);
        else setUser(null);
      } else {
        setUser(null);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleAuthSuccess = () => {
    // User state is updated via onAuthStateChange; just close the modal
    setIsAuthModalOpen(false);
  };

  const handleUserUpdate = async (updatedUser: User) => {
    const fresh = await api.updateUserProfile(updatedUser);
    setUser(fresh);
  };

  const handleLogout = async () => {
    await api.logout();
    setUser(null);
  };

  return (
    <HashRouter>
      <PageTitle />
      <div className="min-h-screen bg-gray-50 flex flex-col">
        <Navbar
          user={user}
          onOpenLogin={() => setIsAuthModalOpen(true)}
          onLogout={handleLogout}
        />

        <AuthModal
          isOpen={isAuthModalOpen}
          onClose={() => setIsAuthModalOpen(false)}
          onLogin={handleAuthSuccess}
        />

        {needsPasswordSet && (
          <SetPasswordModal onComplete={() => setNeedsPasswordSet(false)} />
        )}

        <main className="flex-1">
          <Routes>
            <Route path="/" element={<Home user={user} />} />
            <Route path="/direct-tax" element={<DirectTax />} />

            <Route
              path="/survey"
              element={user ? <Survey /> : <Navigate to="/" replace />}
            />

            <Route
              path="/report"
              element={user ? <Report user={user} /> : <Navigate to="/" replace />}
            />

            <Route
              path="/admin"
              element={user?.role === 'admin' ? <Admin user={user} /> : <Navigate to="/" replace />}
            />

            <Route
              path="/profile"
              element={user ? <Profile user={user} onUpdate={handleUserUpdate} /> : <Navigate to="/" replace />}
            />

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>

        <footer className="bg-white border-t border-gray-200 py-8 mt-auto">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs sm:text-sm text-gray-500">
            <span>&copy; {new Date().getFullYear()} TaxTech Benchmark. All rights reserved.</span>
            <div className="flex gap-6">
              <a href="mailto:jiyangu923@gmail.com" className="hover:text-primary transition-colors">Contact</a>
              <Link to="/" className="hover:text-primary transition-colors">Home</Link>
            </div>
          </div>
        </footer>
      </div>
    </HashRouter>
  );
};

export default App;
