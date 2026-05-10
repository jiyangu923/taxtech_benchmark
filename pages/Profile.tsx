
import React, { useState, useEffect } from 'react';
import { User as UserIcon, Mail, ShieldCheck, Save, CheckCircle2, AlertCircle, Loader2, ArrowLeft, Bell } from 'lucide-react';
import { Link } from 'react-router-dom';
import { User } from '../types';
import { useUpdateEmailReminderPref } from '../services/queries';

interface ProfileProps {
  user: User;
  onUpdate: (updatedUser: User) => void;
}

const Profile: React.FC<ProfileProps> = ({ user, onUpdate }) => {
  const [name, setName] = useState(user.name);
  const [email, setEmail] = useState(user.email);
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Default-true: profiles row defaults to email_reminders_enabled = true,
  // and any pre-migration row that lacks the column is also treated as opted-in.
  const [emailReminders, setEmailReminders] = useState(user.email_reminders_enabled !== false);
  const [reminderError, setReminderError] = useState<string | null>(null);
  const updatePref = useUpdateEmailReminderPref();

  useEffect(() => {
    setName(user.name);
    setEmail(user.email);
    setEmailReminders(user.email_reminders_enabled !== false);
  }, [user]);

  const handleToggleReminders = (next: boolean) => {
    const previous = emailReminders;
    setEmailReminders(next); // optimistic
    setReminderError(null);
    updatePref.mutate(next, {
      onError: (e: any) => {
        setEmailReminders(previous); // revert
        setReminderError(e?.message || 'Could not update preference. Try again.');
      },
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !email) {
      setError("Name and email are required.");
      return;
    }
    
    setIsLoading(true);
    setError(null);
    setIsSuccess(false);

    try {
      // Simulate network latency
      await new Promise(resolve => setTimeout(resolve, 800));
      const updatedUser: User = { ...user, name, email };
      onUpdate(updatedUser);
      setIsSuccess(true);
      setTimeout(() => setIsSuccess(false), 3000);
    } catch (err) {
      setError("Failed to update profile. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto py-12 px-4 sm:px-6 lg:px-8 bg-gray-50 min-h-screen">
      <div className="mb-8 flex items-center gap-4">
        <Link to="/" className="p-2 hover:bg-white rounded-full transition-all text-gray-500 hover:text-primary">
          <ArrowLeft className="h-6 w-6" />
        </Link>
        <div>
          <h1 className="font-display text-3xl font-semibold text-gray-900 tracking-tight">Account Profile</h1>
          <p className="text-gray-500 font-medium">Manage your personal settings and identity</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
        {/* Left Column: Summary Card */}
        <div className="lg:col-span-1">
          <div className="bg-white rounded-3xl shadow-xl border border-gray-100 overflow-hidden text-center p-6 sm:p-8">
            <div className="inline-flex items-center justify-center h-24 w-24 rounded-full bg-indigo-50 mb-4 border-4 border-white shadow-sm ring-1 ring-indigo-100">
              <UserIcon className="h-10 w-10 text-primary" />
            </div>
            <h3 className="text-xl font-bold text-gray-900">{user.name}</h3>
            <p className="text-sm text-gray-500 mb-6">{user.email}</p>
            
            <div className={`inline-flex items-center gap-2 px-4 py-1.5 rounded-full border text-xs font-bold uppercase tracking-widest ${user.role === 'admin' ? 'bg-orange-50 border-orange-200 text-orange-700' : 'bg-gray-50 border-gray-200 text-gray-700'}`}>
              {user.role === 'admin' ? <ShieldCheck className="h-4 w-4" /> : <UserIcon className="h-4 w-4" />}
              {user.role}
            </div>
            
            <div className="mt-8 pt-8 border-t border-gray-50 text-left">
              <p className="text-[10px] font-black uppercase text-gray-400 tracking-widest mb-4">Security Notice</p>
              <div className="bg-blue-50/50 rounded-xl p-4 border border-blue-100">
                <p className="text-xs text-blue-800 leading-relaxed font-medium">
                  Your identity is verified through Google SSO. Profile changes are saved to your account.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Edit Form */}
        <div className="lg:col-span-2">
          <div className="bg-white rounded-3xl shadow-xl border border-gray-100 p-8 sm:p-10">
            <h3 className="text-lg font-bold text-gray-900 mb-6 flex items-center gap-3">
              <Save className="h-5 w-5 text-primary" /> General Information
            </h3>

            {error && (
              <div className="mb-6 p-4 bg-red-50 border border-red-100 rounded-2xl flex items-center gap-3 text-sm text-red-700 animate-shake">
                <AlertCircle className="h-5 w-5 flex-shrink-0" />
                {error}
              </div>
            )}

            {isSuccess && (
              <div className="mb-6 p-4 bg-green-50 border border-green-100 rounded-2xl flex items-center gap-3 text-sm text-green-700 animate-fadeIn">
                <CheckCircle2 className="h-5 w-5 flex-shrink-0" />
                Profile updated successfully.
              </div>
            )}

            <form onSubmit={handleSubmit} method="post" className="space-y-6">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-gray-500 uppercase tracking-widest ml-1">Full Name</label>
                <div className="relative group">
                  <UserIcon className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400 group-focus-within:text-primary transition-colors" />
                  <input
                    type="text"
                    required
                    maxLength={100}
                    disabled={isLoading}
                    className="w-full pl-12 pr-4 py-4 bg-gray-50 border border-gray-200 rounded-2xl focus:ring-4 focus:ring-primary/5 focus:border-primary transition-all text-sm outline-none font-bold"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-gray-500 uppercase tracking-widest ml-1">Email Address</label>
                <div className="relative group">
                  <Mail className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-300" />
                  <input
                    type="email"
                    readOnly
                    className="w-full pl-12 pr-4 py-4 bg-gray-100 border border-gray-200 rounded-2xl text-sm outline-none font-bold text-gray-500 cursor-not-allowed"
                    value={email}
                  />
                </div>
                <p className="text-[10px] text-gray-400 font-medium ml-1">Email is linked to your authentication provider and cannot be changed here.</p>
              </div>

              <div className="pt-4">
                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full flex items-center justify-center gap-2 py-4 bg-primary text-white rounded-2xl font-bold hover:bg-indigo-900 transition-all shadow-xl shadow-primary/20 active:scale-[0.98] disabled:opacity-70"
                >
                  {isLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>

          {/* Notifications */}
          <div className="bg-white rounded-3xl shadow-xl border border-gray-100 p-8 sm:p-10 mt-8">
            <h3 className="text-lg font-bold text-gray-900 mb-6 flex items-center gap-3">
              <Bell className="h-5 w-5 text-primary" /> Notifications
            </h3>

            {reminderError && (
              <div className="mb-4 p-4 bg-red-50 border border-red-100 rounded-2xl flex items-center gap-3 text-sm text-red-700">
                <AlertCircle className="h-5 w-5 flex-shrink-0" />
                {reminderError}
              </div>
            )}

            <label className="flex items-start justify-between gap-6 cursor-pointer">
              <div className="min-w-0">
                <p className="font-semibold text-gray-900">Email reminders</p>
                <p className="text-sm text-gray-500 font-medium mt-1 leading-relaxed">
                  We'll occasionally email you to finish your survey, update your data when the survey changes, or refresh your numbers each quarter so the benchmark stays current. Turn this off to opt out of all reminder emails.
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={emailReminders}
                onClick={() => handleToggleReminders(!emailReminders)}
                disabled={updatePref.isPending}
                className={`relative inline-flex h-7 w-12 flex-shrink-0 items-center rounded-full transition-colors mt-1 ${
                  emailReminders ? 'bg-primary' : 'bg-gray-300'
                } ${updatePref.isPending ? 'opacity-50 cursor-wait' : ''}`}
              >
                <span
                  aria-hidden="true"
                  className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
                    emailReminders ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </label>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Profile;
