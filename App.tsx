import React, { useState, useEffect } from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import Navbar from './components/Navbar';
import AuthModal from './components/AuthModal';
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

  useEffect(() => {
    // Load initial session
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (session?.user) {
        const profile = await api.ensureProfile(session.user);
        setUser(profile);
      }
    });

    // Listen for sign-in / sign-out (including OAuth redirects back from Google)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (session?.user) {
        const profile = await api.ensureProfile(session.user);
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
