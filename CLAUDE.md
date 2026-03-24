# Project Memory

## Supabase Project
- **Project ref:** `tpyyquhpovbwtzcpucqm`
- **Supabase URL:** `https://tpyyquhpovbwtzcpucqm.supabase.co`

## Google OAuth Setup Checklist

### Supabase Dashboard
- URL: https://supabase.com/dashboard/project/tpyyquhpovbwtzcpucqm/auth/providers
- Check: Google provider is **enabled**
- Check: **Client ID** and **Client Secret** are filled in

### Google Cloud Console
- URL: https://console.cloud.google.com → APIs & Services → Credentials
- Required redirect URI: `https://tpyyquhpovbwtzcpucqm.supabase.co/auth/v1/callback`

## Required `.env.local` Variables
```
VITE_SUPABASE_URL=https://tpyyquhpovbwtzcpucqm.supabase.co
VITE_SUPABASE_ANON_KEY=sb_publishable_mmo9723RyXpCIwzb6WWBxg_4uhzGAnk
VITE_GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com   # ← still missing!
```
