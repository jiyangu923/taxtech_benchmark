import React, { useState, useEffect } from 'react';
import { useGoogleLogin } from '@react-oauth/google';
import { X, Mail, Lock, ShieldCheck, AlertCircle, Eye, EyeOff, Loader2, CheckCircle2, LogIn } from 'lucide-react';
import { mockStore } from '../services/mockStore';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLogin: () => void;
}

const AuthModal: React.FC<AuthModalProps> = ({ isOpen, onClose, onLogin }) => {
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      setEmail('');
      setPassword('');
      setName('');
      setError(null);
      setIsLoading(false);
      setIsSuccess(false);
      setMode('login');
    }
  }, [isOpen]);

  const finishLogin = async () => {
    setIsSuccess(true);
    await new Promise(resolve => setTimeout(resolve, 600));
    onLogin();
    onClose();
  };

  const handleAuthAction = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
      await new Promise(resolve => setTimeout(resolve, 800));

      if (mode === 'signup') {
        if (!name) throw new Error('Please enter your full name.');
        mockStore.register(name, email, password);
      } else {
        mockStore.login(email, password);
      }

      await finishLogin();
    } catch (err: any) {
      setError(err.message || 'An authentication error occurred.');
    } finally {
      setIsLoading(false);
    }
  };

  const googleLogin = useGoogleLogin({
    flow: 'implicit',
    onSuccess: async (tokenResponse) => {
      setIsLoading(true);
      setError(null);
      try {
        const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
          headers: { Authorization: `Bearer ${tokenResponse.access_token}` },
        });
        if (!res.ok) throw new Error('Failed to fetch Google profile.');
        const profile: { email: string; name: string } = await res.json();
        mockStore.loginWithGoogle(profile.email, profile.name);
        await finishLogin();
      } catch (err: any) {
        setError(err.message || 'Google sign-in failed.');
      } finally {
        setIsLoading(false);
      }
    },
    onError: () => {
      setError('Google sign-in was cancelled or failed. Please try again.');
    },
  });

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6 overflow-hidden">
      <div
        className="absolute inset-0 bg-gray-900/40 backdrop-blur-md transition-opacity duration-300"
        onClick={!isLoading ? onClose : undefined}
      />

      <div className="relative w-full max-w-md bg-white rounded-3xl shadow-2xl overflow-hidden transform transition-all animate-fadeIn border border-gray-100">
        <div className="px-8 py-10">
          <div className="flex justify-between items-center mb-8">
            <div>
              <h2 className="text-2xl font-black text-gray-900 tracking-tight">
                {mode === 'login' ? 'Welcome Back' : 'Create Account'}
              </h2>
              <p className="text-sm text-gray-500 mt-1 font-medium">
                {mode === 'login' ? 'Sign in to your benchmarking portal' : 'Join the industry benchmark study'}
              </p>
            </div>
            {!isLoading && (
              <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-2 hover:bg-gray-100 rounded-xl transition-all">
                <X className="h-6 w-6" />
              </button>
            )}
          </div>

          {isSuccess ? (
            <div className="py-12 flex flex-col items-center justify-center animate-bounceIn">
              <div className="bg-green-100 p-4 rounded-full mb-4">
                <CheckCircle2 className="h-12 w-12 text-green-600" />
              </div>
              <h3 className="text-xl font-black text-gray-900">Successfully Verified</h3>
              <p className="text-gray-500 text-sm mt-1 font-medium">Preparing your insights...</p>
            </div>
          ) : (
            <div className="space-y-6">
              {error && (
                <div className="p-4 bg-red-50 border border-red-100 rounded-xl flex items-center gap-3 text-xs text-red-700 font-bold animate-shake">
                  <AlertCircle className="h-5 w-5 flex-shrink-0" />
                  {error}
                </div>
              )}

              {/* Real Google OAuth button — opens the Google account picker popup */}
              <button
                type="button"
                onClick={() => googleLogin()}
                disabled={isLoading}
                className="w-full flex items-center justify-center gap-3 px-4 py-4 border border-gray-200 rounded-2xl bg-white hover:bg-gray-50 transition-all font-bold text-gray-700 shadow-sm active:scale-[0.99] disabled:opacity-50"
              >
                {isLoading ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <svg className="h-5 w-5" viewBox="0 0 24 24">
                    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.26.81-.58z" fill="#FBBC05" />
                    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                  </svg>
                )}
                Continue with Google
              </button>

              <div className="relative py-2">
                <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-gray-100"></div></div>
                <div className="relative flex justify-center text-[10px] uppercase"><span className="bg-white px-4 text-gray-400 font-black tracking-[0.2em]">OR BUSINESS IDENTITY</span></div>
              </div>

              <form onSubmit={handleAuthAction} className="space-y-4">
                {mode === 'signup' && (
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest ml-1">Full Name</label>
                    <input
                      type="text" required placeholder="John Doe"
                      className="w-full px-5 py-4 bg-gray-50 border border-gray-200 rounded-2xl focus:ring-4 focus:ring-primary/5 focus:border-primary transition-all text-sm outline-none font-bold placeholder:text-gray-300"
                      value={name} onChange={(e) => setName(e.target.value)}
                    />
                  </div>
                )}

                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest ml-1">Work Email</label>
                  <div className="relative group">
                    <Mail className="absolute left-5 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-300 group-focus-within:text-primary transition-colors" />
                    <input
                      type="email" required placeholder="name@company.com"
                      className="w-full pl-14 pr-5 py-4 bg-gray-50 border border-gray-200 rounded-2xl focus:ring-4 focus:ring-primary/5 focus:border-primary transition-all text-sm outline-none font-bold placeholder:text-gray-300"
                      value={email} onChange={(e) => setEmail(e.target.value)}
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest ml-1">Password</label>
                  <div className="relative group">
                    <Lock className="absolute left-5 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-300 group-focus-within:text-primary transition-colors" />
                    <input
                      type={showPassword ? 'text' : 'password'} required placeholder="••••••••"
                      className="w-full pl-14 pr-14 py-4 bg-gray-50 border border-gray-200 rounded-2xl focus:ring-4 focus:ring-primary/5 focus:border-primary transition-all text-sm outline-none font-bold placeholder:text-gray-300"
                      value={password} onChange={(e) => setPassword(e.target.value)}
                    />
                    <button
                      type="button" onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-5 top-1/2 -translate-y-1/2 text-gray-300 hover:text-gray-500 transition-colors"
                    >
                      {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                    </button>
                  </div>
                </div>

                <button
                  type="submit" disabled={isLoading}
                  className="w-full flex items-center justify-center gap-2 py-4.5 bg-primary text-white rounded-2xl font-black text-sm uppercase tracking-widest hover:bg-indigo-900 transition-all shadow-xl shadow-primary/20 active:scale-[0.98] disabled:opacity-70 mt-4"
                >
                  {isLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : mode === 'login' ? 'Sign In' : 'Create Account'}
                </button>
              </form>

              <div className="text-center pt-2">
                {mode === 'login' ? (
                  <p className="text-sm font-bold text-gray-500">
                    New to the portal? <button onClick={() => setMode('signup')} className="text-primary hover:underline">Register now</button>
                  </p>
                ) : (
                  <p className="text-sm font-bold text-gray-500">
                    Already have an account? <button onClick={() => setMode('login')} className="text-primary hover:underline">
                      <LogIn className="h-4 w-4 inline mr-1" />Sign In
                    </button>
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
        <div className="bg-gray-50/80 px-8 py-5 border-t border-gray-100 flex items-center justify-center gap-2">
          <ShieldCheck className="h-3.5 w-3.5 text-gray-400" />
          <p className="text-[10px] font-black text-gray-400 uppercase tracking-[0.15em]">Secured by Google OAuth 2.0</p>
        </div>
      </div>
    </div>
  );
};

export default AuthModal;
