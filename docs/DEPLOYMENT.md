# Deployment guide

## Components

- Deploy the Vite frontend to a static host with `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` configured at build time.
- Deploy the Express API as a container. Set `JWT_SECRET`, `PORT`, and the production database connection where Prisma-backed operations are enabled.
- Use Supabase for Auth, Postgres, Realtime, and Storage. Keep service-role keys server-only.

## Production checklist

- Set the Supabase Auth site URL and approved redirect URLs.
- Apply migrations with `supabase db push` from CI.
- Create a private `evidence` storage bucket and require signed upload URLs.
- Rotate JWT and device signing keys; never expose them in `VITE_` variables.
- Enforce HTTPS, configure object lifecycle retention, and monitor verification failures.
- Run `npm test` and `npm run build` before deployment.
