# Deploying BECOMING OS

You need two free accounts: **Supabase** (database, logins, photo storage) and
**Vercel** (hosting). About 15 minutes, no terminal required.

---

## 1. Create the Supabase project

1. At **[supabase.com/dashboard](https://supabase.com/dashboard)** → **New project**.
   Pick a region near you and save the database password somewhere safe.
2. When it's ready, open **SQL Editor → New query**, paste the entire contents of
   [`supabase/migrations/20261010000000_becoming_os.sql`](supabase/migrations/20261010000000_becoming_os.sql),
   and press **Run**. It should finish with “Success. No rows returned”.

   This creates every table, the row-level-security policies, the partner-sharing
   functions and the private `progress-photos` storage bucket.
3. Open **Project Settings → API** and copy:
   - **Project URL** → this is `VITE_SUPABASE_URL`
   - **anon public** key → this is `VITE_SUPABASE_ANON_KEY`

   The anon key is designed to be public. It can only do what the row-level-security
   policies allow, and every table has them. **Never** use the `service_role` key in
   the app.

## 2. Configure sign-in

In **Authentication → URL Configuration** (fill in after step 3 gives you a URL):

| Setting | Value |
|---|---|
| **Site URL** | `https://your-app.vercel.app` |
| **Redirect URLs** | `https://your-app.vercel.app/**` |

These make the email-confirmation and password-reset links return to the app.

**Email confirmation** is on by default: after creating an account, each of you
clicks the link in the confirmation email, then signs in. If you'd rather skip
that, turn off **Authentication → Providers → Email → Confirm email**.

> Supabase's built-in email sender is rate-limited (a few emails per hour). That's
> enough for two people. For more, add your own SMTP under **Authentication → Emails**.

## 3. Deploy to Vercel

1. At **[vercel.com/new](https://vercel.com/new)**, import `mardae89/cv`.
2. Set **Root Directory** to `becoming-os`. The framework preset (**Vite**) is detected.
3. Under **Environment Variables**, add:

   | Name | Value |
   |---|---|
   | `VITE_SUPABASE_URL` | the Project URL from step 1 |
   | `VITE_SUPABASE_ANON_KEY` | the anon public key from step 1 |

4. **Deploy.** If the app is still on a feature branch, either merge it to `main`
   first or set that branch as the Production Branch under *Settings → Git*.

Go back to step 2 and put the `*.vercel.app` URL into Supabase.

`vercel.json` already routes every path to the app, so deep links and refreshes work.
Netlify works the same way (`public/_redirects` is included).

## 4. First use

1. Open the URL on your phone. In Safari: **Share → Add to Home Screen** for a
   full-screen app icon.
2. **You:** *Create account* → choose **Body, business and a 10K** → confirm your
   starting weight (pre-filled with 267 lb from your plan — change it to today's
   scale reading) → continue through setup, skipping anything you're not sure of.
3. **Your wife:** creates her own account on her own phone → **My own
   transformation** → enters her own starting weight. Nothing is pre-filled for her.
4. **Connect:** one of you opens **Together → Create invite code**; the other enters
   it under **Together → Have a code?**. Each of you then reviews
   **Settings → Privacy & sharing**.

Want to look around with realistic data first? Create a *separate* account and pick
**Explore with sample data** on the first setup screen. It's clearly labelled as a
demo and can be reset from Settings.

---

## What isn't set up

- **Phone push / email reminders.** Reminders appear in the in-app notification
  centre when you open the app. Push would need a Web Push key pair, a service
  worker, and a scheduled Supabase Edge Function to send them — not included.
- **Integrations** (Apple Health, Strava, Stripe, bank feeds). Everything is manual
  entry; the tables are plain enough to add importers later.

## Updating the database later

If a future version adds a migration file, run it in the SQL Editor the same way.
Migrations are never edited after they ship.

## Running it locally

```bash
cd becoming-os
npm install
cp .env.example .env.local      # fill in your Supabase URL and anon key
npm run dev                     # http://localhost:8080
```

With the [Supabase CLI](https://supabase.com/docs/guides/cli) and Docker you can run
the whole backend locally instead: `supabase init` once, then `supabase start` — it
applies `supabase/migrations/` automatically and prints a local URL and anon key.
