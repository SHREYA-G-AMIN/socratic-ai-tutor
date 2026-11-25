# Authentication setup

The app uses Supabase Auth with cookie-backed sessions.

## 1. Add environment variables

Set these locally in `.env.local` and in the Vercel project (Production, Preview, and Development):

```env
NEXT_PUBLIC_SUPABASE_URL=https://ipmxgzqxhgdpfhoypufx.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<your Supabase publishable key>
```

The publishable key is safe for browser use. Do not use `SUPABASE_SERVICE_ROLE_KEY` here or expose it with a `NEXT_PUBLIC_` prefix.

## 2. Configure Supabase Auth URLs

In Supabase Dashboard → Authentication → URL Configuration:

- Set Site URL to your deployed app origin.
- Add redirect URLs for your deployed app origin plus `/auth/callback`.
- Add your local origin plus `/auth/callback` (usually `http://localhost:3000/auth/callback`).

The app uses the PKCE callback route to exchange email confirmation, password recovery, and OAuth codes for cookie sessions.

## 3. Enable Google sign-in

In Supabase Dashboard → Authentication → Providers → Google:

1. Enable Google.
2. Create a Google OAuth Web client in Google Cloud Console.
3. Add this Authorized redirect URI in Google Cloud:
   `https://ipmxgzqxhgdpfhoypufx.supabase.co/auth/v1/callback`
4. Copy the Google Client ID and Client Secret into the Supabase Google provider settings and save.

Also add your app's deployed origin and `http://localhost:3000` to the OAuth consent screen's authorized domains/origins as appropriate for your Google Cloud configuration.

## 4. Install and run

Run `npm install` to resolve the newly added Supabase packages and refresh `package-lock.json`, then:

```bash
npm run dev
```

Open `/signup`, `/login`, or `/forgot-password`.

## Notes

- Email/password signup requests email confirmation when confirmation is enabled in Supabase Auth.
- Google sign-in will display a provider error until the Google provider is enabled and its credentials are saved.
- Protected app routes are redirected to `/login` once the public Supabase environment variables are configured.
- The Supabase project settings and Vercel environment variables must still be configured in their dashboards; those credentials/settings are not stored in this repository.
