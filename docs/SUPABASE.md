# Supabase setup

## Local development

1. Install the Supabase CLI and Docker Desktop.
2. Run `supabase start` in the repository root.
3. Run `supabase db reset` to apply the migration in `supabase/migrations`.
4. Copy the local API URL and anon key into `.env` as `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
5. Start the app with `npm run dev`.

## Hosted project

1. Create a Supabase project, then run `supabase link --project-ref <project-ref>`.
2. Apply the schema with `supabase db push`.
3. Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in the deployment environment.
4. Configure the Authentication site URL and redirect URL to the deployed web origin.

The migrations create profiles on signup, add device ownership, enforce append-only signed fingerprints, protect incident metadata with RLS, keep the `evidence` bucket private, and publish fingerprints/incidents through Realtime. Drivers submit evidence only for their device; analysts and admins can retrieve workspace incident evidence.

## Realtime client

RLS remains enforced for each connected user. The Encoder writes signed SHA-256 fingerprint records to `fingerprints`; normal video remains local. Only locked incident video is uploaded to private Storage and linked through `incident_videos`.

The frontend wrappers in `src/auth.js` provide password sign-in, signup, sign-out, and session observation. `src/realtime.js` scopes evidence and incident subscriptions to one workspace. They intentionally throw a clear configuration error until the public URL and anon key are supplied.
