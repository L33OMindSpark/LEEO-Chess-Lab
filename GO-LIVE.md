# Putting LEEO Chess Lab online (login plus background analysis)

What you get: a website with a login. You add a chess.com username, a free background job reads every game and runs Stockfish on the newest 500, and you sign in later to see the results. Everything uses free plans, the same three services as Mind Spark. Nothing is pushed or deployed until you say so.

How the pieces fit:
- **Supabase** keeps the login, the tracked usernames, the games and the engine results.
- **GitHub Actions** is the background computer. Every 30 minutes it looks for new work and runs Stockfish. Free and unlimited on a public repository (this repository holds no personal data or keys).
- **Cloudflare** serves the website.

The quick version of the site (no login, runs in the browser) keeps working without any of this.

## Before you push or deploy: checklist
- [ ] The repository holds no keys: only the public Supabase URL and anon key ever go on the website, and the worker secret lives only in GitHub secrets. Never use or copy the `service_role` / `secret` key anywhere here.
- [ ] Signups stay off (Part A, step 5). Only accounts you create can sign in.
- [ ] **Licence:** Stockfish is open source under the GPL, and the website serves a copy. Keep the link to its source code in `README.md` and add a line on the site if you share it widely.
- [ ] Your own chess.com username is public data. If you let friends in, tell them their games and their opponents' usernames are stored in your database, and delete on request (the Remove button deletes everything for that username).
- [ ] The name "LEEO Chess Lab" is fine for a private beta. Check trademarks before promoting it widely.

## Part A: Supabase, about 10 minutes
1. Sign in at https://supabase.com. **New project**, name `chess-lab`, generate and save the database password, **EU region**, **Free** plan.
2. **SQL Editor, New query.** Run this in Terminal, then paste (Cmd+V) and press **Run**:
   ```bash
   cd ~/chess-lab && pbcopy < supabase/migrations/0001_chess_lab.sql
   ```
   Expected: "Success. No rows returned".
3. Make the worker secret. Run this in Terminal and keep the long text it prints (you need it twice, here and in Part B):
   ```bash
   openssl rand -hex 32
   ```
   **New query**, paste the line below with your secret in place of `PASTE_SECRET`, **Run**:
   ```sql
   insert into public.worker_key values (encode(extensions.digest('PASTE_SECRET', 'sha256'), 'hex'));
   ```
4. **Project Settings, then API Keys.** Copy the **Project URL** and the **anon / publishable** key.
5. **Authentication, then Sign In / Providers, then Email:** switch **off** "Allow new users to sign up".
6. **Authentication, then Users, then Add user, then Create new user:** your email and a password, tick **Auto Confirm User**.

## Part B: GitHub, the background computer, about 5 minutes
1. Create a new **Public** repository named `chess-lab` under your account (tell me when it exists and I will connect the folder and push, after your OK).
2. In the repository: **Settings, then Secrets and variables, then Actions, then New repository secret.** Add three:
   | Name | Value |
   |---|---|
   | `SUPABASE_URL` | the Project URL |
   | `SUPABASE_ANON_KEY` | the anon / publishable key |
   | `WORKER_SECRET` | the long text from step A3 |
3. **Actions tab, then Analyse chess accounts, then Run workflow** to test it once. It should end green, with "nothing to do" in the log.

## Part C: Cloudflare, the website, about 5 minutes
1. https://dash.cloudflare.com, **Create application**, **Import a repository**, pick `chess-lab`.
2. Settings: name `chess-lab`, production branch `main`, build command `npm run build`, deploy command `npx wrangler deploy`.
3. Build variables (they must be *build* variables):
   | Name | Value |
   |---|---|
   | `VITE_SUPABASE_URL` | the Project URL |
   | `VITE_SUPABASE_ANON_KEY` | the anon / publishable key |
   | `NODE_VERSION` | `22` |
4. **Save and Deploy.** You get an address like `https://chess-lab.something.workers.dev`.
5. Back in Supabase: **Authentication, then URL Configuration**, set **Site URL** to that address.

## Using it
Open the site, **Sign in**, then **Account, My accounts**, type a username and **Track account**. The status goes from waiting to reading to analysing to ready. The job checks every 30 minutes, so the first start can take up to half an hour, and 500 games take about an hour of computer time, spread over a few runs automatically. Close the page, come back later, press **Open**. Finished accounts refresh themselves twice a day.

## Good to know (free plans)
- Supabase pauses a project nobody has used for a week. The 30 minute job counts as use, so it stays awake. If it ever shows a **Restore** button, press it.
- GitHub switches off scheduled jobs on a public repository after 60 days without any change to it. If that happens, open the Actions tab and press **Enable workflow**.
- If a run fails, the account shows "Something went wrong" with the reason and a **Try again** button.

## Testing it yourself without the internet services
```bash
node worker/mock.mjs                 # a tiny pretend Supabase on port 54321
npm run test:worker                  # runs the real job against it (reads real chess.com data)
npm i --no-save @electric-sql/pglite && node supabase/test-sql.mjs   # checks the database security rules
```
