# RENI NOW LEARNING — full stack (Supabase + Express backend)

Everything lives flat in one folder — no `public/`, `server/`, or
`supabase/` subfolders:

```
index.html               frontend dashboard (served by server.js)
config.js                 optional static fallback for Supabase keys
app.js                     auth + all data fetching/rendering
server.js                  Express entrypoint — admin/instructor API + serves the files above
supabaseAdmin.js            service-role Supabase client (server only, never sent to browser)
auth-middleware.js          verifies the student's session + checks their role
routes-roadmaps.js          one file per resource:
routes-assignments.js       roadmaps, assignments, assessments, xp,
routes-assessments.js       sessions, content, subscriptions,
routes-xp.js                letters, admin
routes-sessions.js
routes-content.js
routes-subscriptions.js
routes-letters.js
routes-admin.js
01_schema.sql               SQL to run once in the Supabase SQL editor, in order:
02_rls.sql                  01 → tables, 02 → row level security,
03_functions.sql            03 → leaderboard/dashboard RPCs, 04 → optional sample data
04_seed.sql
package.json / package-lock.json
render.yaml                 Render deploy config
.env.example / .gitignore
```

The student-facing dashboard still talks to Supabase **directly** with the
public anon key, protected by the RLS policies in `02_rls.sql` — that part is
unchanged. The new `server/` folder is the real backend: it holds the
**service-role key** and exposes the instructor/admin actions that RLS
deliberately blocks from the browser (grading, awarding XP, publishing
roadmaps/content/sessions, issuing recognition letters, recording payments).

## 1. Create the database

In your Supabase project → SQL Editor, run these files **in order**:

1. `01_schema.sql` — tables
2. `02_rls.sql` — row level security policies
3. `03_functions.sql` — leaderboard / dashboard-stats / progress views
4. `04_seed.sql` *(optional)* — sample data
5. `05_admin_additions.sql` — adds a `blocked` flag to `profiles` and locks
   down which columns a student can edit on their own row (so a student
   can't self-promote to admin or un-block themselves via the anon key)

## 2. Configure auth

Supabase → Authentication → Providers:
- Keep **Email** enabled.
- "Confirm signup" is on by default — turn it off in Authentication →
  Settings if you want instant access without email confirmation.

## 3. Get your keys

Supabase → Project Settings → API. You need three values:

| Key | Used by | Safe to expose in browser? |
| --- | --- | --- |
| Project URL | frontend + backend | yes |
| `anon` `public` key | frontend | yes — RLS protects the data |
| `service_role` key | **backend only** | **no — keep secret** |

## 4. Run it locally

```bash
npm install
cp .env.example .env
# edit .env with your SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY
npm start
```

Open http://localhost:3000 — the backend serves the dashboard and fetches
`SUPABASE_URL` / `SUPABASE_ANON_KEY` from your `.env` automatically via
`/api/config`, so you don't need to touch `config.js` at all.

## 5. Deploy to Render

1. Push this repo to GitHub (including `render.yaml`).
2. On Render: **New → Blueprint**, point it at your repo. Render reads
   `render.yaml` and creates a Web Service for you.
   - (Or: **New → Web Service** manually — Build command `npm install`,
     Start command `npm start`.)
3. In the service's **Environment** tab, set:
   - `SUPABASE_URL`
   - `SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
4. Deploy. Render will build, start `npm start`, and health-check `/healthz`.
5. Your app is live at `https://<your-service-name>.onrender.com`.

No further config is needed — the frontend pulls its Supabase keys from the
backend at runtime, so nothing sensitive is committed to the repo.

## 6. Backend API reference

All routes below (except `/api/config` and `/healthz`) require:

```
Authorization: Bearer <supabase access_token>
```

which is the same token the frontend already holds after login
(`sb.auth.getSession().data.session.access_token`). Routes marked
**instructor/admin** additionally check `profiles.role`.

| Method & path | Who | What it does |
| --- | --- | --- |
| `GET /api/config` | anyone | hands the frontend `SUPABASE_URL`/`SUPABASE_ANON_KEY` |
| `GET /healthz` | anyone | health check for Render |
| `POST /api/roadmaps` | instructor/admin | create a roadmap |
| `PATCH /api/roadmaps/:id` | instructor/admin | update a roadmap |
| `DELETE /api/roadmaps/:id` | instructor/admin | delete a roadmap |
| `POST /api/roadmaps/:id/modules` | instructor/admin | add a module |
| `POST /api/assignments` | instructor/admin | create an assignment |
| `POST /api/assignments/:id/submit` | student | submit their own work |
| `POST /api/assignments/submissions/:id/grade` | instructor/admin | grade + optionally award XP |
| `POST /api/assessments` | instructor/admin | create an assessment |
| `POST /api/assessments/:id/results` | instructor/admin | record a result + optionally award XP |
| `POST /api/xp/award` | instructor/admin | award/deduct XP directly |
| `POST /api/sessions` | instructor/admin | schedule a live session |
| `PATCH /api/sessions/:id` | instructor/admin | update a session (e.g. add recording) |
| `GET /api/sessions/:id/rsvps` | instructor/admin | see who RSVP'd |
| `POST /api/content` | instructor/admin | add a content item |
| `PATCH /api/content/:id` | instructor/admin | update a content item |
| `DELETE /api/content/:id` | instructor/admin | remove a content item |
| `POST /api/subscriptions` | instructor/admin | manually set a student's plan |
| `POST /api/subscriptions/webhook` | payment provider | webhook stub — see note below |
| `POST /api/letters` | instructor/admin | issue a recognition letter |
| `GET /api/admin/students` | instructor/admin | list all students (with email + blocked status) |
| `PATCH /api/admin/students/:id/block` | instructor/admin | block/unblock a student's access |
| `PATCH /api/admin/students/:id/role` | admin | promote/demote a user's role |
| `GET /api/qr/me` | any signed-in user | PNG QR code for your own student ID badge |
| `GET /api/qr/student/:id` | instructor/admin | PNG QR code for any student |
| `GET /api/qr/letter/:code` | anyone | PNG QR code for a recognition letter |
| `GET /api/verify/student/:id` | anyone | what a scanned student QR resolves to |
| `GET /api/letters/verify/:code` | anyone | what a scanned certificate QR resolves to |

## 7. Admin console

Open `/admin.html` on your deployed URL (or the "Admin console" link that
appears in the student dashboard sidebar once you're logged in as an
instructor/admin). From there you can:

- **Students** — see every student (name, email, phone, role, status),
  **block/unblock** access, and generate a printable QR ID badge for any
  student.
- **Assignments** — post new assignments directly (title, roadmap, due date,
  max score) and see everything already posted.
- **Classes** — schedule live sessions with a meeting link, and see the
  full schedule.
- **Recognition letters** — issue a certificate to a student right from
  the console. Each one gets a unique code and a QR code; scanning it opens
  `/verify-letter.html`, a public page confirming the certificate is
  genuine (no login needed — this is what you'd put on a printed
  certificate or share with an employer).

**Blocking:** a blocked student is signed out immediately the next time the
frontend checks their session (on login, or on their next page load), and
sees "This account has been blocked. Contact your instructor."

**QR codes:** every student has a unique QR under Profile → RENI QR in the
main dashboard (and via `/api/qr/me`). Scanning it opens
`/verify-student.html`, a public page showing just their name, role, and
member-since date — nothing sensitive.



**Payment webhook note:** `POST /api/subscriptions/webhook` records a
payment and updates the plan, but does **not** verify a signature yet —
wire in your provider's SDK (Razorpay/Stripe) and check its signature header
before trusting the payload; that part is provider-specific and left as a
clearly marked `TODO` in `routes-subscriptions.js`.

**Making the first instructor/admin:** every new signup starts as
`role = 'student'` (see `01_schema.sql`). Promote your own account once,
directly in Supabase → Table Editor → `profiles` → set `role` to `admin`.
After that you can use `PATCH /api/admin/students/:id/role` for everyone else.

## 7. Logo

I couldn't find a logo file attached to our conversation — please upload
the image and I'll drop it into the sidebar (`.brand-mark`), the
recognition-letter header (`.letter-brand-mark`), and add it as the
favicon.

## How each page is wired (frontend)

| Page | Data source |
| --- | --- |
| Dashboard | `get_dashboard_stats()` RPC + `get_my_roadmap_progress()` |
| Roadmaps | `roadmaps` joined with the student's own progress |
| Assignments | `assignments` + student's own `assignment_submissions` (grading now via backend) |
| Assessments | `assessments` + student's own `assessment_results` (recording now via backend) |
| Leaderboard | `get_leaderboard()` RPC — name + XP + rank only |
| Sessions | `live_sessions`, RSVP writes to `session_rsvps` |
| Content | `content_items` |
| Profile / Settings | `profiles` (editable), `auth.users.email` (read-only) |
| Subscription | `subscriptions` + `billing_history` |
| Recognition Letter | `recognition_letters` (issued via backend) |
