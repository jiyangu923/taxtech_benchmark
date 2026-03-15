import React, { useState, useEffect } from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
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

    // Load initial session — profile is guaranteed to exist (created by DB trigger)
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (session?.user) {
        const profile = await api.getCurrentUser();
        setUser(profile);
      }
    });

    // Listen for sign-in / sign-out (including OAuth redirects back from Google)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (session?.user) {
        const profile = await api.getCurrentUser();
        setUser(profile);
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
      </div>
    </HashRouter>
  );
};

export default App;
