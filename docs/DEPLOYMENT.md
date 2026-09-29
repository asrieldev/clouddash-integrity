# Deployment guide

## Components

- The supplied Docker image serves both the Vite frontend and Express API from one HTTPS service. This is the simplest deployment option for CloudDash.
- Configure `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` as **build variables**. They are public browser configuration values, not server secrets.
- Configure `JWT_SECRET` and the production `DATABASE_URL` as server environment variables. Never use a `VITE_` prefix for either secret.
- Use Supabase for Auth, Postgres, Realtime, and Storage. Keep service-role keys server-only.

## Deploy from GitHub

1. Create a new Web Service on your preferred container host and connect `asrieldev/clouddash-integrity`.
2. Use the repository `Dockerfile`; no separate build or start command is required.
3. Add the build variables `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` from your Supabase project.
4. Add the runtime variables `JWT_SECRET`, `DATABASE_URL`, and `PORT=3001`.
5. Deploy. The service URL opens the CloudDash app, while `/api/health` provides a deployment health check.
6. In Supabase Dashboard, add the deployed URL to **Authentication → URL Configuration → Site URL** and **Redirect URLs**.

## Verify after deployment

1. Open `<your-service-url>/api/health`; it should return `{"status":"healthy",...}`.
2. Open the app, sign in, and capture a short test clip.
3. Confirm the clip appears in Verify evidence, download it, then add it back and confirm its SHA-256 match.

## Production checklist

- Set the Supabase Auth site URL and approved redirect URLs.
- Apply migrations with `supabase db push` from CI.
- Create a private `evidence` storage bucket and require signed upload URLs.
- Rotate JWT and device signing keys; never expose them in `VITE_` variables.
- Enforce HTTPS, configure object lifecycle retention, and monitor verification failures.
- Run `npm test` and `npm run build` before deployment.
