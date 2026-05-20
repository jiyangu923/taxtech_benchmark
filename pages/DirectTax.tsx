import React, { useState, useEffect } from 'react';
import { Hammer, CheckCircle, LogIn } from 'lucide-react';
import { api } from '../services/api';
import { User } from '../types';

interface DirectTaxProps {
  user: User | null;
  onOpenLogin: () => void;
}

const DirectTax: React.FC<DirectTaxProps> = ({ user, onOpenLogin }) => {
  const [subscribed, setSubscribed] = useState(() => {
    if (!user) return false;
    try { return localStorage.getItem('directtax_notify') === 'true'; }
    catch { return false; }
  });

  useEffect(() => {
    if (!user) {
      setSubscribed(false);
      return;
    }
    api.getDirectTaxNotify().then(serverVal => {
      if (serverVal) {
        setSubscribed(true);
        try { localStorage.setItem('directtax_notify', 'true'); } catch {}
      }
    }).catch(() => { /* use localStorage fallback */ });
  }, [user]);

  return (
    <div className="flex flex-col items-center justify-center min-h-[80vh] bg-gray-50 px-4">
      <div className="bg-white p-6 sm:p-8 md:p-12 rounded-2xl shadow-xl text-center max-w-2xl w-full border border-gray-100">
        <div className="inline-flex items-center justify-center h-24 w-24 rounded-full bg-indigo-50 mb-8 animate-pulse">
          <Hammer className="h-12 w-12 text-secondary" />
        </div>
        <h1 className="font-display text-3xl sm:text-4xl font-semibold tracking-tight text-gray-900 mb-4">Direct Tax Benchmark</h1>
        <div className="h-1 w-20 bg-secondary mx-auto mb-6 rounded-full"></div>
        <p className="text-base sm:text-lg md:text-xl text-gray-600 mb-8 leading-relaxed">
          We are actively building the benchmark survey and analytics for <span className="font-semibold text-gray-800">Direct Tax</span> (Corporate Income Tax, Transfer Pricing, and Provision).
        </p>
        <div className="bg-indigo-50 rounded-lg p-6 mb-8">
            <h3 className="font-semibold text-indigo-900 mb-2">Coming Soon</h3>
            <p className="text-indigo-700 text-sm">
                Expected launch: Q3 2026.
            </p>
        </div>
        {subscribed ? (
          <div className="inline-flex items-center gap-2 px-8 py-3 text-base font-medium rounded-md text-green-700 bg-green-50 border border-green-200">
            <CheckCircle className="h-5 w-5" />
            You'll be notified when Direct Tax launches
          </div>
        ) : user ? (
          <button
            onClick={() => { setSubscribed(true); try { localStorage.setItem('directtax_notify', 'true'); } catch {} api.subscribeDirectTaxNotify().catch(() => {}); }}
            className="inline-flex items-center justify-center px-8 py-3 border border-transparent text-base font-medium rounded-md text-white bg-primary hover:bg-indigo-900 transition-all shadow-md hover:shadow-lg transform hover:-translate-y-0.5"
          >
            Notify Me When Ready
          </button>
        ) : (
          <div className="flex flex-col items-center gap-3">
            <button
              onClick={onOpenLogin}
              className="inline-flex items-center justify-center gap-2 px-8 py-3 border border-transparent text-base font-medium rounded-md text-white bg-primary hover:bg-indigo-900 transition-all shadow-md hover:shadow-lg transform hover:-translate-y-0.5"
            >
              <LogIn className="h-5 w-5" />
              Sign in to be notified
            </button>
            <p className="text-xs text-gray-500">A free account lets us notify you when Direct Tax launches.</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default DirectTax;