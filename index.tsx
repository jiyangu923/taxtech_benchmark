import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import { supabase } from './services/api';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

// Perform all Supabase auth work before React mounts to avoid
// StrictMode double-firing useEffect and creating lock conflicts.
// Wipe legacy mock-store keys (contained seeded passwords + cached submissions
// from a prior dev/mock implementation). Safe to remove unconditionally.
['tax_benchmark_db_users', 'tax_benchmark_db_submissions', 'tax_benchmark_db_settings', 'tax_benchmark_db_user_session']
  .forEach(k => { try { localStorage.removeItem(k); } catch {} });

async function bootstrap() {
  // 1. Exchange PKCE code if returning from OAuth redirect
  const params = new URLSearchParams(window.location.search);
  const code = params.get('code');
  if (code) {
    await supabase.auth.exchangeCodeForSession(code);
    window.history.replaceState({}, '', window.location.pathname + window.location.hash);
  }

  // 2. Load the initial session once, outside React
  const { data: { session } } = await supabase.auth.getSession();
  (window as any).__INITIAL_SESSION__ = session;

  const root = ReactDOM.createRoot(rootElement!);
  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
}

bootstrap();