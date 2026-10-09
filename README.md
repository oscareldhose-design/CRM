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

The website (themaap.co.uk) is hosted with **Hostinger**; the Lucky Draw is in its `draw` folder. The CRM goes next
to it, in a `crm` folder, so it is at `https://themaap.co.uk/crm/`. It needs PHP 7.4 or newer with SQLite, which
Hostinger has switched on.

1. **Get the files.** Use the `crm-upload.zip` you were given (or build it from this repository with
   `git archive --format=zip --prefix=crm/ -o crm-upload.zip HEAD:crm`). Never upload a `crm/data` folder copied
   from another computer: it would bring that computer's test logins and clients with it.
2. **Upload with Hostinger's File Manager.** hPanel → **Websites** → themaap.co.uk → **File manager**. Open
   `public_html` (the folder that already contains `draw`). Upload `crm-upload.zip`, right-click it → **Extract**
   into `public_html`. You now have `public_html/crm/` with `index.html`, `api.php`, `.htaccess` and the `js`,
   `lib` and `assets` folders. Delete the zip.
   *(With FTP instead, e.g. FileZilla: upload the whole `crm` folder into `public_html`, and turn on "show hidden
   files" so the two `.htaccess` files go up too: one in `crm`, one in `crm/lib`.)*
3. **Open `https://themaap.co.uk/crm/`.** The sign-in page appears and the first visit creates the database in
   `crm/data` (nobody can download it). `http://` addresses are sent to `https://` automatically. These logins
   are ready:

   | Username     | Password    | Opens                                                                  |
   |--------------|-------------|------------------------------------------------------------------------|
   | `newcastle`  | `Map@2025#` | The whole Newcastle office's CRM                                        |
   | `nottingham` | `Map@2025#` | The whole Nottingham office's CRM                                       |
   | `london`     | `Map@2025#` | The whole London office's CRM                                           |
   | `admin`      | `Map@2025#` | The **website admin panel**: the website, plus approving and managing every CRM login |

   The three office logins are equal: each is one login for a whole office (not a person) and sees every
   client, case and task in that office. Each adviser has their own login on top of that.
4. **Sign in as `admin` first.** A recovery code is shown once. Write it down and keep it somewhere safe.
   If the admin password is ever forgotten, "Forgot password?" on the sign-in page uses this code to reset it.
5. **Change the four passwords** (the **Password** button in the admin panel; **My account → Change password**
   in the CRM). ⚠️ This repository is public, so anyone can read the starting password here and in
   `crm/config.php`. Change them straight away, or make the repository private.
6. **Make the request emails arrive** (see below), then click **Send a test email** in the admin panel under
   **CRM logins → Offices & settings**.
7. **Delete the old `admin.html`** from `public_html`. It is open to anyone at `themaap.co.uk/admin.html`. The
   new panel is at `https://themaap.co.uk/crm/website-admin.php`: going there while signed out shows the
   sign-in page first, and signing in as `admin` opens it.
8. *(Optional)* **Run the reminders overnight too.** hPanel → **Advanced → Cron Jobs**: add a daily job that runs
   `php` with the file `public_html/crm/api.php` and the word `cron` after it (hPanel shows the full path, e.g.
   `/usr/bin/php /home/u…/domains/themaap.co.uk/public_html/crm/api.php cron`). Without it, the reminders still
   run whenever someone uses the CRM.

**Updating later:** upload the new files over the old ones (extract the new zip into `public_html` and let it
replace files). Never delete or replace `crm/data`: it holds all the CRM's data.

If the CRM is not at `https://themaap.co.uk/crm/`, change `CRM_PUBLIC_URL` in `crm/config.php` (it's the link in
the login-request emails). If the website's `images` folder is not at the site root, adjust `CRM_WEBSITE_BASE`.
The admin panel loads advisor photos from there.

### Make the request emails arrive

Every access request emails **info@themaap.co.uk**. The email is sent by the website's server (Hostinger) from
`no-reply@themaap.co.uk`. But themaap.co.uk's email is Microsoft 365, set up through GoDaddy, and the domain's
**SPF record** (the list of servers allowed to send its email) doesn't include Hostinger yet. Until it does,
Microsoft 365 treats these emails as fake and puts them in Junk or quarantine.

1. Sign in to **GoDaddy** → **My Products** → themaap.co.uk → **DNS**.
2. Find the **TXT** record whose value starts `v=spf1` (there must only ever be one). Edit it so it reads:
   `v=spf1 include:secureserver.net include:_spf.mail.hostinger.com -all`
   and save. Don't add a second `v=spf1` record.
3. Wait an hour, then click **Send a test email** in the admin panel (CRM logins → Offices & settings). If it lands
   in Junk, mark it **Not junk**. If it doesn't arrive at all, check the quarantine at
   `security.microsoft.com/quarantine`.

Requests always appear in the admin panel under **CRM logins** (with a badge and a banner), even if an email
goes astray. If Hostinger ever asks you to, set `CRM_MAIL_SET_SENDER` to `false` in `crm/config.php`.

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

**The request emails** are sent by the website's server; see **Make the request emails arrive** above for the
one DNS change they need. The addresses are `CRM_NOTIFY_EMAIL` and `CRM_MAIL_FROM` in `crm/config.php`.

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
  data/                 created on first run: the database (never upload, replace or commit this)
tests/*.test.mjs        end-to-end and regression tests
```

## Run it on a computer (for testing)

```
php -S 127.0.0.1:8080 -t crm
```

Run this from the repository folder, then open http://127.0.0.1:8080/. To run all the tests (Node 20 or newer, and
PHP with SQLite on the PATH), run `npm test` from the repository folder. `MAP_CRM_STRINGIFY_FETCHES=1 npm test`
runs them the way PHP 7.4 and 8.0 return database numbers.

Advice and suitability always stay with the adviser. The system suggests and summarises.
