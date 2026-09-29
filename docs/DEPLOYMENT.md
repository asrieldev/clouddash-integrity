# Deployment guide

## Components

- Vercel serves the Vite single-page application. The optional Express process only provides `/api/health` for container deployments.
- Configure `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` as **build variables**. They are public browser configuration values, not server secrets.
- Use Supabase for Auth, Postgres, Realtime, and Storage. Keep service-role keys server-only.

## Deploy from GitHub

1. Import the GitHub repository into Vercel.
2. Use `npm run build` and publish `dist`.
3. Add the build variables `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` from your Supabase project.
4. Deploy the app.
5. In Supabase Dashboard, add the deployed URL to **Authentication → URL Configuration → Site URL** and **Redirect URLs**.

## Verify after deployment

1. Open the app, sign in, and capture a short test clip.
2. Refresh and confirm the local clip remains available and its fingerprint is `SENT`.
3. Download it, verify it in the Decoder, then alter/re-encode it and confirm `MISMATCH`.

## Production checklist

- Set the Supabase Auth site URL and approved redirect URLs.
- Apply migrations with `supabase db push` from CI.
- Keep the `evidence` bucket private and apply all RLS migrations.
- Never expose device private keys or Supabase service-role keys.
- Enforce HTTPS, configure object lifecycle retention, and monitor verification failures.
- Run `npm test` and `npm run build` before deployment.
