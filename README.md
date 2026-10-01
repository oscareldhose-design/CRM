# MAP Operating System (CRM)

MAP's own system for running the business, styled to match [themaap.co.uk](https://themaap.co.uk) and the
MAP Lucky Draw (MAP purple `#a308a3` / `#6e006e`, Inter, pill buttons, frosted header, light and dark modes).
It tracks every lead, client and case for every office and adviser, reminds staff what to do next, flags
anything at risk and finds future business, so nothing slips through the cracks.

It also contains the **website admin panel** (advisors, reviews, news, announcements, contact inbox,
newsletter), redesigned to match and protected by the same sign-in page. The admin panel is also where every
CRM login is approved and managed.

Everything lives in the [`crm`](crm) folder. It is plain HTML, CSS and JavaScript with a small PHP API, the
same set-up as the Lucky Draw. There is no build step and no separate database server.

## Put it on your website

1. **Check the server.** It needs PHP 7.4 or newer with SQLite (`pdo_sqlite`). Almost every web host has
   this switched on. If it isn't, the sign-in page says so. Use **https://** so passwords are encrypted.
2. **Upload the `crm` folder** to the website, next to the Lucky Draw's folder, so it's at
   `https://themaap.co.uk/crm/`. Upload everything in it, including `.htaccess` and the `lib`, `js` and
   `assets` folders.
3. **Open `https://themaap.co.uk/crm/`.** The first visit creates the database in `crm/data` (web access to
   it is blocked) along with these logins:

   | Username     | Password    | Opens                                                                  |
   |--------------|-------------|------------------------------------------------------------------------|
   | `newcastle`  | `Map@2025#` | The whole Newcastle office's CRM                                        |
   | `nottingham` | `Map@2025#` | The whole Nottingham office's CRM                                       |
   | `london`     | `Map@2025#` | The whole London office's CRM                                           |
   | `admin`      | `Map@2025#` | The **website admin panel**: the website, plus approving and managing every CRM login |

   The three office logins are equal: each is one login for a whole office (not a person) and sees every
   client, case and task in that office. Each adviser has their own login on top of that.
4. **Sign in as `admin` first.** A recovery code is shown once. Write it down and keep it safe.
   If the admin password is ever forgotten, "Forgot password?" on the sign-in page uses this code to reset it.
5. **Change the four passwords** (My account → Change password, or Password in the website admin
   panel). ⚠️ This repository is public, so anyone can read the starting password here and in `crm/config.php`.
   Change them straight away, or make the repository private.
6. **Delete the old `admin.html`** from the website root. It is currently open to anyone at
   `themaap.co.uk/admin.html`. The new panel is at `https://themaap.co.uk/crm/website-admin.php`. Going there
   while signed out takes you to the sign-in page first, and signing in as `admin` opens it.

If the CRM is not at `https://themaap.co.uk/crm/`, change `CRM_PUBLIC_URL` in `crm/config.php` (it's the link in
the login-request emails). If the website's `images` folder is not at the site root, adjust `CRM_WEBSITE_BASE`.
The admin panel loads advisor photos from there.

## Logins for every adviser

- On the sign-in page, staff choose **Request access** and enter their name, their **@themaap.co.uk** email
  address (nothing else is accepted), a username and a password, and say whether they give
  **Mortgage & protection** or **Protection only** advice.
- An email goes to **info@themaap.co.uk** for every request, with the person's details and a link to the admin
  panel. Replying to it goes to the person who asked.
- The `admin` login approves or rejects each request in the website admin panel, under **CRM logins**. That is
  where you choose their office and role (they don't pick these themselves). Nobody can sign in until they're
  approved.
- The same page lists every login (office logins, advisers and staff, admin logins). From there you can add a
  login, change someone's office, role or advice type, reset a password (they get a temporary one and must
  choose their own), unlock a locked login, or switch a login off. It also has offices, CRM settings, the
  recovery code and backups of every office.

| Login           | Sees                                                                          |
|-----------------|-------------------------------------------------------------------------------|
| Office login (`newcastle`, `nottingham`, `london`) | That whole office, plus the audit log, backups, permanent deletes and GDPR erasure |
| Office manager  | The same, for a person who runs an office                                     |
| Adviser / Administrator | Their office's leads, clients, cases and tasks                        |
| General Sales   | Events, call queue and results only. Can't open client files                  |
| Admin (`admin`) | The website admin panel, including CRM logins. No client files                |

**Protection-only advisers** never see anything to do with mortgages. Mortgage cases, the pipeline, the
remortgage radar, compliance, documents, Quick Case Lookup, mortgage leads and mortgage figures are all
removed. The server refuses them too, not just the screens. Their dashboard, reports and menus are about
cover, quotes, renewals and commission. You can change someone's advice type at any time in **CRM logins**.

**The email needs your web host to send mail.** It uses PHP's `mail()`, which most hosts have switched on, and
is sent from `no-reply@themaap.co.uk`. If no emails arrive, ask your host to enable PHP mail for that address
(or change `CRM_MAIL_FROM` and `CRM_NOTIFY_EMAIL` in `crm/config.php`). Requests always appear in the admin panel
either way.

**Security:** passwords are stored as bcrypt hashes. Five wrong passwords lock a login for 15 minutes,
and repeated failures from one connection are blocked. Sessions are secure, http-only cookies. Every
sign-in, change, deletion, lookup and download is recorded in the audit log against the person who did it.

## What each office can do

| Area | What it does (Mortgage & protection logins) |
|---|---|
| Dashboard | Today's key numbers and reminders for what needs attention now |
| Leads | Every enquiry, auto-scored HOT / WARM / COLD; one click converts to a client (and opens the case or quote) |
| Clients | Full profile: cases, dates, plans held elsewhere, and a timeline of every call, note and email |
| Mortgage pipeline | Board or list from enquiry to completion, with a risk rating and the reason for it |
| Protection & insurance | Life, CI, IP, mortgage protection, home, landlord, PMI and more, with renewals tracked |
| Remortgage radar | Completed clients grouped by when their fixed rate ends |
| Opportunities | Clients without protection, landlords without cover, buyers without home insurance, reviews due, remortgages |
| Compliance | Automatic checklist per case, rated Red / Amber / Green (documents received tick items automatically) |
| Documents | Requested / received / expired per case; "Request standard pack" in one click |
| Tasks & calendar | Overdue, today, next 7 / 60 days, plus a month calendar with completions, renewals and rate ends |
| Introducers | Referral partners with referrals, conversions, completions and fees counted automatically |
| Team & workload | Who is overloaded, at a glance |
| Reports | Pipeline, revenue by adviser, cases gone quiet, lead sources, completions per month, lost reasons |
| Also | Email templates (copied into your normal email), lost cases (reopenable), audit log, trash with restore, Excel import/export, backups |

Every screen has instant search (press `/`), a notification bell, a quick-add button, light/dark mode and
**Quick Case Lookup**, which finds any case in any office by surname without showing another office's
contact details. It works on phones too.

**Automatic rules:** a new lead creates a "contact lead" task. An offer creates a completion-prep task
for the administrator. A completion books a post-completion call and records the fixed-rate end date. A fixed
rate six months from ending creates a remortgage opportunity and task. A case with nothing scheduled gets
flagged with a review task. A renewal that's due, or a quote that goes quiet, creates a follow-up task.
These rules run while people use the CRM. For them to run overnight as well, add an optional cron job:
`php /path/to/crm/api.php cron`.

**General Sales:** add the event MAP sponsored and import its sign-up list (Excel or CSV). Duplicates and
people without consent are skipped automatically. The call queue says who to ring next and never gives two
agents the same person. Interested contacts are handed over by picking the office, adviser and administrator,
and they arrive as a new lead with the full call history. Results show reach, interest, hand-overs,
conversions and cost per hand-over for each event.

**Keeping data safe:** offices can't see each other's clients, and General Sales can't see client files. If
two people edit the same record at once, the second save is refused rather than overwriting the first, and
they're asked to reload. Deleted items go to the trash and can be restored. GDPR erasure removes a person's
details and keeps the anonymous figures. Office backups download from **Tools → Import, export & backups**;
backups of every office and the full database file download from the admin panel (**CRM logins → Security &
backups**).

## Files

```
crm/
  index.html            the CRM (sign-in page and app)
  app.css, js/*.js      styles and screens
  api.php               the server API every screen talks to
  config.php            settings: starting password, email domain, notification email, data folder, website base
  website-admin.php     the website admin panel and CRM logins (only after signing in as admin)
  lib/                  server code (web access blocked)
  assets/               MAP logo
  data/                 created on first run: the database (never upload or commit this)
tests/api.test.mjs      end-to-end tests
```

## Run it on a computer (for testing)

```
cd crm
php -S 127.0.0.1:8080
```

Then open http://127.0.0.1:8080/. To run the tests (Node 20 or newer and PHP on the PATH):
`node --test tests/api.test.mjs`.

Advice and suitability always stay with the adviser. The system suggests and summarises.
