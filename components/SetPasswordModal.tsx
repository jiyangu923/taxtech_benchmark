import React, { useState } from 'react';
import { Lock, Eye, EyeOff, Loader2, CheckCircle2, AlertCircle, ShieldCheck } from 'lucide-react';
import { supabase } from '../services/api';

interface SetPasswordModalProps {
  onComplete: () => void;
}

const SetPasswordModal: React.FC<SetPasswordModalProps> = ({ onComplete }) => {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSuccess, setIsSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      setIsSuccess(true);
      await new Promise(resolve => setTimeout(resolve, 1000));
      onComplete();
    } catch (err: any) {
      setError(err.message || 'Failed to set password.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6 overflow-hidden">
      <div className="absolute inset-0 bg-gray-900/40 backdrop-blur-md" />

      <div className="relative w-full max-w-md bg-white rounded-3xl shadow-2xl overflow-hidden border border-gray-100">
        <div className="px-8 py-10">
          <div className="mb-8">
            <h2 className="text-2xl font-black text-gray-900 tracking-tight">Set Your Password</h2>
            <p className="text-sm text-gray-500 mt-1 font-medium">
              Welcome! Please create a password to secure your account.
            </p>
          </div>

          {isSuccess ? (
            <div className="py-12 flex flex-col items-center justify-center">
              <div className="bg-green-100 p-4 rounded-full mb-4">
                <CheckCircle2 className="h-12 w-12 text-green-600" />
              </div>
              <h3 className="text-xl font-black text-gray-900">Password Set!</h3>
              <p className="text-gray-500 text-sm mt-1 font-medium">Taking you to your account...</p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
              {error && (
                <div className="p-4 bg-red-50 border border-red-100 rounded-xl flex items-center gap-3 text-xs text-red-700 font-bold">
                  <AlertCircle className="h-5 w-5 flex-shrink-0" />
                  {error}
                </div>
              )}

              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest ml-1">New Password</label>
                <div className="relative group">
                  <Lock className="absolute left-5 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-300 group-focus-within:text-primary transition-colors" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    placeholder="••••••••"
                    className="w-full pl-14 pr-14 py-4 bg-gray-50 border border-gray-200 rounded-2xl focus:ring-4 focus:ring-primary/5 focus:border-primary transition-all text-sm outline-none font-bold placeholder:text-gray-300"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-5 top-1/2 -translate-y-1/2 text-gray-300 hover:text-gray-500 transition-colors"
                  >
                    {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                  </button>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest ml-1">Confirm Password</label>
                <div className="relative group">
                  <Lock className="absolute left-5 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-300 group-focus-within:text-primary transition-colors" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    placeholder="••••••••"
                    className="w-full pl-14 pr-5 py-4 bg-gray-50 border border-gray-200 rounded-2xl focus:ring-4 focus:ring-primary/5 focus:border-primary transition-all text-sm outline-none font-bold placeholder:text-gray-300"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full flex items-center justify-center gap-2 py-4 bg-primary text-white rounded-2xl font-black text-sm uppercase tracking-widest hover:bg-indigo-900 transition-all shadow-xl shadow-primary/20 active:scale-[0.98] disabled:opacity-70 mt-2"
              >
                {isLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : 'Set Password & Continue'}
              </button>
            </form>
          )}
        </div>
        <div className="bg-gray-50/80 px-8 py-5 border-t border-gray-100 flex items-center justify-center gap-2">
          <ShieldCheck className="h-3.5 w-3.5 text-gray-400" />
          <p className="text-[10px] font-black text-gray-400 uppercase tracking-[0.15em]">Secured by Supabase</p>
        </div>
      </div>
    </div>
  );
};

export default SetPasswordModal;
