import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { supabase } from './services/api';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

// Exchange PKCE auth code before React mounts to avoid StrictMode double-fire
// causing Supabase lock conflicts.
async function bootstrap() {
  const params = new URLSearchParams(window.location.search);
  const code = params.get('code');
  if (code) {
    await supabase.auth.exchangeCodeForSession(code);
    // Clean up the URL so the code isn't reused on refresh
    window.history.replaceState({}, '', window.location.pathname + window.location.hash);
  }

  const root = ReactDOM.createRoot(rootElement!);
  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
}

bootstrap();