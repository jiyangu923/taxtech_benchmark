import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { supabase } from './services/api';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

// Perform all Supabase auth work before React mounts to avoid
// StrictMode double-firing useEffect and creating lock conflicts.
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