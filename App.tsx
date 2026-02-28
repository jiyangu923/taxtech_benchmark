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
import { mockStore } from './services/mockStore';

const App: React.FC = () => {
  const [user, setUser] = useState<User | null>(null);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);

  useEffect(() => {
    // Check if session persists
    const current = mockStore.getCurrentUser();
    if (current) {
        setUser(current);
    }
  }, []);

  const handleAuthSuccess = () => {
    // Refresh user state from the now-populated store session
    const freshUser = mockStore.getCurrentUser();
    setUser(freshUser);
    setIsAuthModalOpen(false);
  };

  const handleUserUpdate = (updatedUser: User) => {
    const freshUser = mockStore.updateUserProfile(updatedUser);
    setUser(freshUser);
  };

  const handleLogout = () => {
    mockStore.logout();
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