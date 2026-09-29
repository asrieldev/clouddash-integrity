# Supabase setup

## Local development

1. Install the Supabase CLI and Docker Desktop.
2. Run `supabase start` in the repository root.
3. Run `supabase db reset` to apply the migration in `supabase/migrations`.
4. Copy the local API URL and anon key into `.env` as `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
5. Start the app with `npm run start`.

## Hosted project

1. Create a Supabase project, then run `supabase link --project-ref <project-ref>`.
2. Apply the schema with `supabase db push`.
3. Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in the deployment environment.
4. Configure the Authentication site URL and redirect URL to the deployed web origin.

The migration creates the `profiles` row automatically on signup, scopes all evidence and fingerprint reads by workspace membership, permits device/evidence mutation only to Admin and Analyst members, and publishes evidence segments, fingerprints, incidents, and integrity checks through Realtime.

## Realtime client

Subscribe with `supabase.channel('evidence').on('postgres_changes', { event: '*', schema: 'public', table: 'fingerprints' }, handler).subscribe()`. RLS remains enforced for each connected user. The Encoder writes only timestamped SHA-256 fingerprint records to this table; captured videos remain local to the driver device.

The frontend wrappers in `src/auth.js` provide password sign-in, signup, sign-out, and session observation. `src/realtime.js` scopes evidence and incident subscriptions to one workspace. They intentionally throw a clear configuration error until the public URL and anon key are supplied.
