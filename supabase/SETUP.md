# Haze Atlas Supabase setup

1. Create a Supabase project.
2. In **SQL Editor**, run `supabase/schema.sql`.
3. In **Authentication → URL Configuration**, add:
   - Site URL: `https://creative-cmj.github.io/haze-values/`
   - Redirect URL: `https://creative-cmj.github.io/haze-values/**`
4. Copy the project URL and **publishable/anon** key into `supabase-config.js`. Never use a service-role key in that file.
5. Deploy the protected snapshot function if desired:
   ```bash
   supabase login
   supabase link --project-ref YOUR_PROJECT_REF
   supabase secrets set SUPABASE_URL=https://YOUR_PROJECT.supabase.co SUPABASE_SERVICE_ROLE_KEY=YOUR_SERVICE_ROLE_KEY
   supabase functions deploy sync-snapshot
   ```
6. Create an account in Haze Atlas, then promote the intended owner in SQL:
   ```sql
   update public.profiles set role='admin' where id='AUTH_USER_UUID';
   ```

The frontend is intentionally local-only until step 4 is completed. No server secret is committed to this repository.
