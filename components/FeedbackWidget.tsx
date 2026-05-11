import React, { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import {
  MessageSquarePlus, X, Bug, Lightbulb, MessageCircle, Send, Loader2, CheckCircle2, AlertCircle,
} from 'lucide-react';
import { useSubmitFeedback } from '../services/queries';
import { FeedbackType, User } from '../types';

interface FeedbackWidgetProps {
  /** Currently signed-in user, or null. Used to pre-fill name/email when known. */
  user: User | null;
}

/**
 * Floating "Feedback" button (bottom-right) + modal form.
 *
 * Shown on every page (mounted in App.tsx). Anonymous visitors can submit;
 * authenticated users skip the email/name fields since we already know them.
 *
 * Anti-spam posture: none in v1. RLS allows any insert. If volume becomes
 * a problem, add Cloudflare Turnstile here.
 */
const FeedbackWidget: React.FC<FeedbackWidgetProps> = ({ user }) => {
  const location = useLocation();
  const [isOpen, setIsOpen] = useState(false);
  const [type, setType] = useState<FeedbackType>('bug');
  const [message, setMessage] = useState('');
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [isSuccess, setIsSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = useSubmitFeedback();

  useEffect(() => {
    if (!isOpen) {
      // Defer reset so closing-animation users still see content briefly
      const t = setTimeout(() => {
        setMessage('');
        setEmail('');
        setName('');
        setType('bug');
        setIsSuccess(false);
        setError(null);
      }, 200);
      return () => clearTimeout(t);
    }
  }, [isOpen]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim()) {
      setError('Please describe what you want to tell us.');
      return;
    }
    setError(null);
    submit.mutate(
      {
        type,
        message: message.trim(),
        user_email: user?.email || (email.trim() || undefined),
        user_name:  user?.name  || (name.trim()  || undefined),
        page_path:  location.pathname + location.hash,
        user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : undefined,
      },
      {
        onSuccess: () => {
          setIsSuccess(true);
          setTimeout(() => setIsOpen(false), 1800);
        },
        onError: (e: any) => setError(e?.message || 'Could not submit. Try again.'),
      }
    );
  };

  return (
    <>
      {/* Floating launch button */}
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className="fixed bottom-6 right-6 z-40 inline-flex items-center gap-2 px-4 py-3 bg-primary text-white rounded-full shadow-xl shadow-primary/20 hover:bg-indigo-900 hover:scale-105 transition-all font-bold text-sm"
          aria-label="Send feedback"
        >
          <MessageSquarePlus className="h-5 w-5" />
          <span className="hidden sm:inline">Feedback</span>
        </button>
      )}

      {/* Modal */}
      {isOpen && (
        <div className="fixed inset-0 z-[90] flex items-end sm:items-center justify-center sm:p-6">
          <div
            className="absolute inset-0 bg-gray-900/40 backdrop-blur-sm"
            onClick={!submit.isPending ? () => setIsOpen(false) : undefined}
          />
          <div className="relative w-full sm:max-w-md bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl border border-gray-100 animate-fadeIn overflow-hidden">
            <div className="p-6 sm:p-8">
              <div className="flex items-start justify-between mb-6">
                <div>
                  <h2 className="font-display text-xl font-semibold text-gray-900">Share your feedback</h2>
                  <p className="text-sm text-gray-500 font-medium mt-1">Bugs, ideas, anything — admin reviews everything.</p>
                </div>
                <button onClick={() => setIsOpen(false)} disabled={submit.isPending} className="text-gray-400 hover:text-gray-600 p-2 hover:bg-gray-100 rounded-xl transition-all disabled:opacity-40" aria-label="Close">
                  <X className="h-5 w-5" />
                </button>
              </div>

              {isSuccess ? (
                <div className="py-12 flex flex-col items-center justify-center animate-fadeIn">
                  <div className="bg-green-100 p-4 rounded-full mb-4">
                    <CheckCircle2 className="h-12 w-12 text-green-600" />
                  </div>
                  <h3 className="font-display text-lg font-semibold text-gray-900">Thanks for the feedback</h3>
                  <p className="text-sm text-gray-500 font-medium mt-1 text-center max-w-xs">
                    We'll review it and follow up if needed.
                  </p>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-5">
                  {error && (
                    <div className="p-3 bg-red-50 border border-red-100 rounded-xl flex items-center gap-3 text-xs text-red-700 font-bold">
                      <AlertCircle className="h-4 w-4 flex-shrink-0" /> {error}
                    </div>
                  )}

                  {/* Type selector */}
                  <div>
                    <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest ml-1 mb-2 block">Type</label>
                    <div className="grid grid-cols-3 gap-2">
                      {([
                        { v: 'bug',     label: 'Bug',     icon: Bug },
                        { v: 'feature', label: 'Feature', icon: Lightbulb },
                        { v: 'general', label: 'General', icon: MessageCircle },
                      ] as const).map(opt => (
                        <button
                          key={opt.v}
                          type="button"
                          onClick={() => setType(opt.v as FeedbackType)}
                          className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border text-xs font-bold transition-all ${
                            type === opt.v
                              ? 'bg-indigo-50 border-indigo-200 text-primary'
                              : 'bg-white border-gray-200 text-gray-500 hover:border-gray-300'
                          }`}
                        >
                          <opt.icon className="h-5 w-5" />
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest ml-1 block">Message</label>
                    <textarea
                      required
                      rows={4}
                      placeholder={type === 'bug'
                        ? "What broke? Where did it happen? What did you expect?"
                        : type === 'feature'
                          ? "What would you like to see?"
                          : "Tell us anything."}
                      className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-2xl focus:ring-4 focus:ring-primary/5 focus:border-primary transition-all text-sm outline-none font-medium placeholder:text-gray-300 resize-none"
                      value={message}
                      onChange={e => setMessage(e.target.value)}
                      maxLength={4000}
                    />
                  </div>

                  {!user && (
                    <>
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest ml-1 block">
                          Email <span className="font-medium text-gray-300 normal-case tracking-normal">(optional, so we can follow up)</span>
                        </label>
                        <input
                          type="email"
                          placeholder="you@company.com"
                          className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-2xl focus:ring-4 focus:ring-primary/5 focus:border-primary transition-all text-sm outline-none font-medium placeholder:text-gray-300"
                          value={email}
                          onChange={e => setEmail(e.target.value)}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest ml-1 block">
                          Name <span className="font-medium text-gray-300 normal-case tracking-normal">(optional)</span>
                        </label>
                        <input
                          type="text"
                          placeholder="Your name"
                          className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-2xl focus:ring-4 focus:ring-primary/5 focus:border-primary transition-all text-sm outline-none font-medium placeholder:text-gray-300"
                          value={name}
                          onChange={e => setName(e.target.value)}
                          maxLength={100}
                        />
                      </div>
                    </>
                  )}

                  <button
                    type="submit"
                    disabled={submit.isPending}
                    className="w-full inline-flex items-center justify-center gap-2 py-4 bg-primary text-white rounded-2xl font-bold uppercase text-xs tracking-widest hover:bg-indigo-900 transition-all shadow-lg shadow-primary/20 disabled:opacity-70"
                  >
                    {submit.isPending
                      ? <Loader2 className="h-5 w-5 animate-spin" />
                      : <><Send className="h-4 w-4" /> Send feedback</>
                    }
                  </button>
                </form>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default FeedbackWidget;
