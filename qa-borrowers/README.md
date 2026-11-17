# QA Borrowers Dashboard — GitHub Pages + Supabase

## Source mapping
Material name, condition borrowed, borrower name, borrower department, purpose, date/time out, date/time in, released by name, duration hours, remarks are represented. Duration is calculated from timestamps. The original 'Released by (Sign)' field is represented by an authenticated employee audit ID, not a legally equivalent handwritten/digital signature.

## Setup
1. Create a Supabase project. In SQL Editor run `supabase/schema.sql` (additive, RLS enabled). It creates `qa_employees`, `qa_borrowings`, `qa_login_attempts` and two RPC functions. Existing tables are not deleted.
2. In SQL Editor, provision the first admin by uncommenting the INSERT shown in schema.sql and replacing its initial PIN. Never use an easily guessed production PIN.
3. Install Supabase CLI. Log in and link the project: `supabase login`, `supabase link --project-ref YOUR_PROJECT_REF`.
4. Set secrets: `supabase secrets set APP_SESSION_SECRET="YOUR_RANDOM_64_CHARACTER_SECRET" APP_ORIGIN="https://YOUR_GITHUB_USERNAME.github.io"` (use your exact GitHub Pages origin, no trailing slash). Supabase automatically provides SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in deployed Edge Functions. Never place service role keys in GitHub Pages files.
5. Deploy: `supabase functions deploy api --no-verify-jwt`. The function validates its own signed sessions. This option is necessary for employee PIN login; do not enable anonymous table policies.
6. Update `config.js` with your Supabase project URL.
7. Create a GitHub repository, upload `index.html`, `app.js`, `config.js` (do not upload private secrets). Settings > Pages > Deploy from a branch > main / (root). Open `https://YOUR_GITHUB_USERNAME.github.io/REPOSITORY/`.
8. Sign in with the first admin code/PIN, add employee accounts, then test borrowing, returning, sign-out, and multi-device updates.

## Important production controls
Four-digit PINs have only 10,000 combinations. The function rate-limits failed logins per IP (8 attempts / 15 minutes), uses bcrypt hashes in Postgres, and creates 1-hour signed sessions. For sensitive operations, use SSO/MFA instead. Add employee lockout, PIN rotation/reset, audit events, backups, and pagination before large-scale use. Do not expose employee PINs or service role keys in public repositories. GitHub Pages hosts only public static files. Supabase service-role access stays in Edge Functions.

## Source data
The linked Excel file preview contained column headers but no transaction rows. Historical data is NOT imported. Export any historical rows as CSV for a later validated import.
